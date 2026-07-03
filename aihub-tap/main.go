// aihub-tap: 透明记录代理 + 管理查询 API
//
// 链路:
//   [client] → nginx → aihub-tap:8080
//                         ├─ /v1/*           → tee proxy → new-api:3000(写 tap.jsonl)
//                         ├─ /aihub-admin/*  → 直连 new-api-postgres 跑 SQL,X-Admin-Key 鉴权
//                         └─ 其它            → 透传 new-api:3000(不记录)
//
// tap 部分: 抓 /v1/* 请求体+响应体(含 SSE 流) 写 /logs/tap.jsonl。
//
// admin 部分(需要 NEW_API_POSTGRES_DSN + AIHUB_ADMIN_KEY 两个 env):
//   GET /aihub-admin/balances                — 列全部用户余额(quota+token 汇总)
//   GET /aihub-admin/consumption?...         — 时段消耗(model/user/token/group_by 过滤)
//
// 实现细节:
//   - quotaPerUnit = 500000:new-api 内部 quota 单位换算成 USD
//   - 时区默认 Asia/Shanghai(时间参数解析 + bucket 显示)
//   - postgres 用 pgxpool,失败不影响 /v1/* tap 主路径

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	upstream     = "http://new-api:3000"
	quotaPerUnit = 500000.0 // 500K quota = $1 USD,new-api 默认值,对应 /api/status quota_per_unit
)

var (
	logFile  *os.File
	logDate  string // 当前 log 文件对应的日期(Asia/Shanghai YYYY-MM-DD),用于日切
	logMu    sync.Mutex
	adminKey string
	pgPool   *pgxpool.Pool
	shTZ     = mustTZ("Asia/Shanghai")
)

const (
	tapLogDir     = "/logs"
	tapLogRetain  = 3 // 保留最近 N 天,超过删掉
)

func mustTZ(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.UTC
	}
	return loc
}

func main() {
	if err := os.MkdirAll(tapLogDir, 0755); err != nil {
		log.Fatal(err)
	}
	// 首次打开当天 log 文件(日切在 writeTapLog 里做)
	if err := openTodayLogFile(); err != nil {
		log.Fatal(err)
	}

	adminKey = os.Getenv("AIHUB_ADMIN_KEY")
	if adminKey == "" {
		log.Println("[warn] AIHUB_ADMIN_KEY unset — /aihub-admin/* 永远返回 403")
	}
	if dsn := os.Getenv("NEW_API_POSTGRES_DSN"); dsn != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		pool, err := pgxpool.New(ctx, dsn)
		if err != nil {
			log.Printf("[warn] postgres connect failed: %v", err)
		} else if err := pool.Ping(ctx); err != nil {
			log.Printf("[warn] postgres ping failed: %v", err)
		} else {
			pgPool = pool
			log.Println("connected to new-api-postgres for admin queries")
		}
	} else {
		log.Println("[warn] NEW_API_POSTGRES_DSN unset — admin queries disabled")
	}

	log.Println("aihub-tap :8080 → " + upstream)
	srv := &http.Server{
		Addr:              ":8080",
		Handler:           http.HandlerFunc(routeHandler),
		ReadHeaderTimeout: 30 * time.Second,
		// 不设 ReadTimeout / WriteTimeout:SSE 流可能持续很久
	}
	log.Fatal(srv.ListenAndServe())
}

func routeHandler(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/aihub-admin/") {
		adminRouter(w, r)
		return
	}
	tapHandler(w, r)
}

// ─── admin handlers ─────────────────────────────────────────────────────────

func adminRouter(w http.ResponseWriter, r *http.Request) {
	if adminKey == "" || r.Header.Get("X-Admin-Key") != adminKey {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "forbidden"})
		return
	}
	if pgPool == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "db not connected"})
		return
	}
	switch r.URL.Path {
	case "/aihub-admin/balances":
		handleBalances(w, r)
	case "/aihub-admin/consumption":
		handleConsumption(w, r)
	default:
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "not found", "supported": []string{"/aihub-admin/balances", "/aihub-admin/consumption"}})
	}
}

func handleBalances(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	rows, err := pgPool.Query(ctx, `
		SELECT u.id, u.username, u.role, u."group", u.quota, u.used_quota,
		       COALESCE(u.email, '') AS email, u.status,
		       (SELECT COUNT(*) FROM tokens t WHERE t.user_id = u.id AND t.deleted_at IS NULL) AS token_count,
		       (SELECT COALESCE(SUM(t.used_quota), 0) FROM tokens t WHERE t.user_id = u.id AND t.deleted_at IS NULL) AS tokens_used_total
		FROM users u
		ORDER BY u.id
	`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	defer rows.Close()
	users := make([]map[string]any, 0)
	for rows.Next() {
		var id, role, status, tokenCount int64
		var username, group, email string
		var quota, usedQuota, tokensUsedTotal int64
		if err := rows.Scan(&id, &username, &role, &group, &quota, &usedQuota, &email, &status, &tokenCount, &tokensUsedTotal); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		users = append(users, map[string]any{
			"id":              id,
			"username":        username,
			"role":            role,
			"group":           group,
			"email":           email,
			"status":          status,
			"remaining_usd":   round4(float64(quota) / quotaPerUnit),
			"used_usd":        round4(float64(usedQuota) / quotaPerUnit),
			"token_count":     tokenCount,
			"tokens_used_usd": round4(float64(tokensUsedTotal) / quotaPerUnit),
			"_raw": map[string]int64{
				"remaining_quota": quota,
				"used_quota":      usedQuota,
			},
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"count": len(users),
		"users": users,
	})
}

func handleConsumption(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	startTs, err := parseTimeParam(q.Get("start"), time.Now().Add(-24*time.Hour))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid start: " + err.Error()})
		return
	}
	endTs, err := parseTimeParam(q.Get("end"), time.Now())
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid end: " + err.Error()})
		return
	}

	groupBy := q.Get("group_by")
	if groupBy == "" {
		groupBy = "day"
	}
	var truncUnit string
	switch groupBy {
	case "hour":
		truncUnit = "hour"
	case "day":
		truncUnit = "day"
	case "month":
		truncUnit = "month"
	default:
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "group_by must be one of: hour | day | month"})
		return
	}

	where := []string{"created_at >= $1", "created_at <= $2"}
	args := []any{startTs.Unix(), endTs.Unix()}
	if v := q.Get("model"); v != "" {
		where = append(where, fmt.Sprintf("model_name = $%d", len(args)+1))
		args = append(args, v)
	}
	if v := q.Get("user"); v != "" {
		where = append(where, fmt.Sprintf("username = $%d", len(args)+1))
		args = append(args, v)
	}
	if v := q.Get("token"); v != "" {
		where = append(where, fmt.Sprintf("token_name = $%d", len(args)+1))
		args = append(args, v)
	}

	sql := fmt.Sprintf(`
		SELECT
		  date_trunc('%s', to_timestamp(created_at) AT TIME ZONE 'Asia/Shanghai') AS bucket,
		  username, token_name, model_name,
		  COUNT(*) AS calls,
		  COALESCE(SUM(prompt_tokens), 0) AS prompt_total,
		  COALESCE(SUM(completion_tokens), 0) AS completion_total,
		  COALESCE(SUM(quota), 0) AS quota_total
		FROM logs
		WHERE %s
		GROUP BY bucket, username, token_name, model_name
		ORDER BY bucket, username, token_name, model_name
	`, truncUnit, strings.Join(where, " AND "))

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	rows, err := pgPool.Query(ctx, sql, args...)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	defer rows.Close()

	results := make([]map[string]any, 0)
	var sumCalls, sumPrompt, sumCompletion, sumQuota int64
	for rows.Next() {
		var bucket time.Time
		var username, tokenName, modelName string
		var calls, promptTotal, completionTotal, quotaTotal int64
		if err := rows.Scan(&bucket, &username, &tokenName, &modelName, &calls, &promptTotal, &completionTotal, &quotaTotal); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		// SQL date_trunc(... AT TIME ZONE 'Asia/Shanghai') 返回的是无时区 timestamp,
		// pgx scan 默认按 UTC,但实际值已经是北京时间 → 用同字面值在 shTZ 时区重构
		bucketCST := time.Date(bucket.Year(), bucket.Month(), bucket.Day(),
			bucket.Hour(), bucket.Minute(), bucket.Second(), 0, shTZ)
		results = append(results, map[string]any{
			"bucket":       bucketCST.Format(time.RFC3339),
			"username":     username,
			"token":        tokenName,
			"model":        modelName,
			"calls":        calls,
			"prompt":       promptTotal,
			"completion":   completionTotal,
			"tokens_total": promptTotal + completionTotal,
			"quota":        quotaTotal,
			"usd":          round4(float64(quotaTotal) / quotaPerUnit),
		})
		sumCalls += calls
		sumPrompt += promptTotal
		sumCompletion += completionTotal
		sumQuota += quotaTotal
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"start":    startTs.In(shTZ).Format(time.RFC3339),
		"end":      endTs.In(shTZ).Format(time.RFC3339),
		"group_by": groupBy,
		"summary": map[string]any{
			"total_calls":      sumCalls,
			"total_prompt":     sumPrompt,
			"total_completion": sumCompletion,
			"total_quota":      sumQuota,
			"total_usd":        round4(float64(sumQuota) / quotaPerUnit),
		},
		"rows": results,
	})
}

func parseTimeParam(s string, def time.Time) (time.Time, error) {
	if s == "" {
		return def, nil
	}
	if ts, err := strconv.ParseInt(s, 10, 64); err == nil {
		return time.Unix(ts, 0), nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	if t, err := time.ParseInLocation("2006-01-02 15:04:05", s, shTZ); err == nil {
		return t, nil
	}
	if t, err := time.ParseInLocation("2006-01-02", s, shTZ); err == nil {
		return t, nil
	}
	return time.Time{}, errors.New("支持格式: unix 秒 / RFC3339 / YYYY-MM-DD [HH:MM:SS]")
}

func round4(f float64) float64 {
	return float64(int64(f*10000+0.5)) / 10000
}

func writeJSON(w http.ResponseWriter, code int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(data)
}

// ─── tap handler(原 /v1/* 透明代理 + 写 jsonl) ─────────────────────────────

func tapHandler(w http.ResponseWriter, r *http.Request) {
	started := time.Now()

	reqBody, _ := io.ReadAll(r.Body)
	r.Body.Close()

	pr, err := http.NewRequestWithContext(r.Context(), r.Method, upstream+r.RequestURI, bytes.NewReader(reqBody))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	for k, vv := range r.Header {
		if strings.EqualFold(k, "Connection") || strings.EqualFold(k, "Upgrade") {
			continue
		}
		for _, v := range vv {
			pr.Header.Add(k, v)
		}
	}

	resp, err := http.DefaultClient.Do(pr)
	if err != nil {
		http.Error(w, "tap upstream: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)

	var respBuf bytes.Buffer
	flusher, _ := w.(http.Flusher)
	buf := make([]byte, 8192)
	for {
		n, rErr := resp.Body.Read(buf)
		if n > 0 {
			chunk := buf[:n]
			if _, werr := w.Write(chunk); werr != nil {
				break
			}
			respBuf.Write(chunk)
			if flusher != nil {
				flusher.Flush()
			}
		}
		if rErr != nil {
			break
		}
	}

	if !strings.HasPrefix(r.URL.Path, "/v1/") {
		return
	}
	rec := map[string]any{
		"ts":          started.UTC().Format(time.RFC3339Nano),
		"method":      r.Method,
		"path":        r.URL.Path,
		"client_ip":   r.Header.Get("X-Real-IP"),
		"ua":          r.Header.Get("User-Agent"),
		"status":      resp.StatusCode,
		"duration_ms": time.Since(started).Milliseconds(),
		"req_body":    string(reqBody),
		"resp_body":   respBuf.String(),
	}
	line, _ := json.Marshal(rec)
	writeTapLog(line)
}

// ─── log rotation ──────────────────────────────────────────────────────────
// 日切策略: 按 Asia/Shanghai 时区当天生成 tap-YYYY-MM-DD.jsonl,超过 tapLogRetain
// 天数的老文件自动清理。避免 tap.jsonl 无限增长撑爆磁盘(2026-07-02 教训)。

func todayInSH() string {
	return time.Now().In(shTZ).Format("2006-01-02")
}

func openTodayLogFile() error {
	logMu.Lock()
	defer logMu.Unlock()
	today := todayInSH()
	path := fmt.Sprintf("%s/tap-%s.jsonl", tapLogDir, today)
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	if logFile != nil {
		logFile.Close()
	}
	logFile = f
	logDate = today
	return nil
}

func writeTapLog(line []byte) {
	logMu.Lock()
	// 日切检测:如果日期变了,关旧文件开新文件
	if today := todayInSH(); today != logDate {
		if logFile != nil {
			logFile.Close()
		}
		path := fmt.Sprintf("%s/tap-%s.jsonl", tapLogDir, today)
		f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			log.Printf("[warn] rotate tap log to %s failed: %v", path, err)
			logMu.Unlock()
			return
		}
		logFile = f
		logDate = today
		log.Printf("tap log rotated → %s", path)
		// 异步清理老文件(不阻塞写路径)
		go cleanupOldTapLogs()
	}
	logFile.Write(line)
	logFile.Write([]byte{'\n'})
	logMu.Unlock()
}

func cleanupOldTapLogs() {
	entries, err := os.ReadDir(tapLogDir)
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-time.Duration(tapLogRetain+1) * 24 * time.Hour)
	for _, e := range entries {
		name := e.Name()
		// 只清 tap-YYYY-MM-DD.jsonl 格式,legacy tap.jsonl 保留
		if !strings.HasPrefix(name, "tap-") || !strings.HasSuffix(name, ".jsonl") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			path := tapLogDir + "/" + name
			if err := os.Remove(path); err != nil {
				log.Printf("[warn] cleanup %s failed: %v", path, err)
			} else {
				log.Printf("cleaned old tap log: %s", path)
			}
		}
	}
}
