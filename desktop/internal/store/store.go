// Package store keeps projects and sessions in a JSON file under
// ~/Library/Application Support/agentdeck.
package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

type Project struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`
}

type Session struct {
	ID             string `json:"id"`
	ProjectID      string `json:"projectId"`
	Agent          string `json:"agent"`
	AgentSessionID string `json:"agentSessionId"`
	Title          string `json:"title"`
	CreatedAt      int64  `json:"createdAt"`
	UpdatedAt      int64  `json:"updatedAt"`
}

type data struct {
	Projects []Project `json:"projects"`
	Sessions []Session `json:"sessions"`
}

type Store struct {
	mu   sync.Mutex
	path string
	d    data
}

func DefaultPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "agentdeck", "state.json"), nil
}

func Open(path string) (*Store, error) {
	s := &Store{path: path}
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	return s, json.Unmarshal(b, &s.d)
}

// save writes atomically; callers hold mu.
func (s *Store) save() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(s.d, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func (s *Store) Projects() []Project {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Project(nil), s.d.Projects...)
}

func (s *Store) Project(id string) (Project, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, p := range s.d.Projects {
		if p.ID == id {
			return p, true
		}
	}
	return Project{}, false
}

func (s *Store) AddProject(p Project) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.d.Projects = append(s.d.Projects, p)
	return s.save()
}

// RemoveProject removes a project and its sessions.
func (s *Store) RemoveProject(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	ps := s.d.Projects[:0]
	for _, p := range s.d.Projects {
		if p.ID != id {
			ps = append(ps, p)
		}
	}
	s.d.Projects = ps
	ss := s.d.Sessions[:0]
	for _, x := range s.d.Sessions {
		if x.ProjectID != id {
			ss = append(ss, x)
		}
	}
	s.d.Sessions = ss
	return s.save()
}

func (s *Store) Sessions() []Session {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Session(nil), s.d.Sessions...)
}

// PutSession adds the session or replaces the one with the same ID.
func (s *Store) PutSession(x Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.d.Sessions {
		if s.d.Sessions[i].ID == x.ID {
			s.d.Sessions[i] = x
			return s.save()
		}
	}
	s.d.Sessions = append(s.d.Sessions, x)
	return s.save()
}

func (s *Store) RemoveSession(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	ss := s.d.Sessions[:0]
	for _, x := range s.d.Sessions {
		if x.ID != id {
			ss = append(ss, x)
		}
	}
	s.d.Sessions = ss
	return s.save()
}
