// aihub-tap: 透明记录代理
//
// [client] → nginx (kb-system-frontend-1) → aihub-tap:8080 → new-api:3000
//
// 抓取 /v1/* 路径下的请求体 + 响应体(包含 SSE 流式响应),写入
// /logs/tap.jsonl。Streaming 模式下用 tee 模式,客户端实时收到 chunk
// 的同时本地累积 buffer,不破坏流。
//
// 不抓: /api/* (admin panel 接口) / 静态文件 — 没意义
//
// 日志格式: 每行一个 JSON object,字段:
//   ts, method, path, client_ip, ua, status, duration_ms, req_body, resp_body
//
// 注意: req_body 和 resp_body 是字符串,流式响应的 resp_body 是完整 SSE 文本流
// (data: {...}\n\n 拼接),由查询者后处理还原。

package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

const upstream = "http://new-api:3000"

var (
	logFile *os.File
	logMu   sync.Mutex
)

func main() {
	if err := os.MkdirAll("/logs", 0755); err != nil {
		log.Fatal(err)
	}
	f, err := os.OpenFile("/logs/tap.jsonl", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Fatal(err)
	}
	logFile = f

	log.Println("aihub-tap :8080 → " + upstream)
	srv := &http.Server{
		Addr:              ":8080",
		Handler:           http.HandlerFunc(handler),
		ReadHeaderTimeout: 30 * time.Second,
		// 不设 ReadTimeout / WriteTimeout:SSE 流可能持续很久
	}
	log.Fatal(srv.ListenAndServe())
}

func handler(w http.ResponseWriter, r *http.Request) {
	started := time.Now()

	// 1. 读完请求体
	reqBody, _ := io.ReadAll(r.Body)
	r.Body.Close()

	// 2. 构造转发请求
	pr, err := http.NewRequestWithContext(r.Context(), r.Method, upstream+r.RequestURI, bytes.NewReader(reqBody))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	for k, vv := range r.Header {
		// hop-by-hop header 不转发
		if strings.EqualFold(k, "Connection") || strings.EqualFold(k, "Upgrade") {
			continue
		}
		for _, v := range vv {
			pr.Header.Add(k, v)
		}
	}

	// 3. 发到 new-api(不设 Timeout,SSE 可能 5+ 分钟)
	resp, err := http.DefaultClient.Do(pr)
	if err != nil {
		http.Error(w, "tap upstream: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// 4. 转发响应头
	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)

	// 5. Tee body: 同时写客户端 + 本地 buffer。
	// SSE 关键: 每读一个 chunk 立即 Flush,客户端就能实时收到
	var respBuf bytes.Buffer
	flusher, _ := w.(http.Flusher)
	buf := make([]byte, 8192)
	for {
		n, rErr := resp.Body.Read(buf)
		if n > 0 {
			chunk := buf[:n]
			if _, werr := w.Write(chunk); werr != nil {
				// 客户端断了,但我们还是把上游剩余 buffer 完
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

	// 6. 写日志(只记 /v1/*,admin/static 不记)
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
	logMu.Lock()
	logFile.Write(line)
	logFile.Write([]byte{'\n'})
	logMu.Unlock()
}
