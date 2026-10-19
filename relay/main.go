// Command relay passes end-to-end encrypted messages between the agentdeck
// Mac app and paired phones; it never sees message contents.
package main

import (
	"flag"
	"log"
	"net/http"
	"time"

	"github.com/mepkn/agentdeck/relay/hub"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8090", "listen address")
	flag.Parse()

	mux := http.NewServeMux()
	mux.Handle("/relay", hub.New())
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok\n")) })

	srv := &http.Server{Addr: *addr, Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	log.Printf("relay listening on %s", *addr)
	log.Fatal(srv.ListenAndServe())
}
