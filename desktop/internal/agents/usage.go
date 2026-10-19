package agents

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os/exec"
	"sync"
	"time"
)

// Limit is one Claude plan limit: how much is used (0-100) and when it resets.
type Limit struct {
	Percent  float64 `json:"percent"`
	ResetsAt string  `json:"resetsAt"`
}

// Usage holds the 5-hour and weekly limits of the signed-in Claude account.
type Usage struct {
	FiveHour *Limit `json:"fiveHour"`
	SevenDay *Limit `json:"sevenDay"`
}

var usageCache struct {
	sync.Mutex
	at  time.Time
	val Usage
}

// ClaudeUsage asks Anthropic for the account's limits with the OAuth token
// Claude Code keeps in the keychain. Answers are reused for a minute.
func ClaudeUsage() (Usage, error) {
	usageCache.Lock()
	defer usageCache.Unlock()
	if time.Since(usageCache.at) < time.Minute {
		return usageCache.val, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	raw, err := exec.CommandContext(ctx, "security", "find-generic-password", "-s", "Claude Code-credentials", "-w").Output()
	if err != nil {
		return Usage{}, errors.New("not signed in to Claude Code")
	}
	var creds struct {
		ClaudeAiOauth struct {
			AccessToken string `json:"accessToken"`
		} `json:"claudeAiOauth"`
	}
	if json.Unmarshal(raw, &creds) != nil || creds.ClaudeAiOauth.AccessToken == "" {
		return Usage{}, errors.New("not signed in to Claude Code")
	}

	req, _ := http.NewRequestWithContext(ctx, "GET", "https://api.anthropic.com/api/oauth/usage", nil)
	req.Header.Set("Authorization", "Bearer "+creds.ClaudeAiOauth.AccessToken)
	req.Header.Set("anthropic-beta", "oauth-2025-04-20")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return Usage{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return Usage{}, errors.New("usage request failed: " + res.Status)
	}
	type window struct {
		Utilization float64 `json:"utilization"`
		ResetsAt    string  `json:"resets_at"`
	}
	var body struct {
		FiveHour *window `json:"five_hour"`
		SevenDay *window `json:"seven_day"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return Usage{}, err
	}
	limit := func(w *window) *Limit {
		if w == nil {
			return nil
		}
		return &Limit{Percent: w.Utilization, ResetsAt: w.ResetsAt}
	}
	usageCache.at = time.Now()
	usageCache.val = Usage{FiveHour: limit(body.FiveHour), SevenDay: limit(body.SevenDay)}
	return usageCache.val, nil
}
