package remote

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"time"
)

const expoPushURL = "https://exp.host/--/api/v2/push/send"

// expoPush sends a notification through Expo's push service.
func expoPush(token, title, body, sessionID string) {
	b, _ := json.Marshal(map[string]any{
		"to":        token,
		"title":     title,
		"body":      body,
		"sound":     "default",
		"priority":  "high",
		"channelId": "agents",
		"data":      map[string]string{"session": sessionID},
	})
	c := http.Client{Timeout: 15 * time.Second}
	resp, err := c.Post(expoPushURL, "application/json", bytes.NewReader(b))
	if err != nil {
		log.Printf("remote: push: %v", err)
		return
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		log.Printf("remote: push: %s", resp.Status)
	}
}
