package remote

import (
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"golang.org/x/crypto/chacha20poly1305"
)

// Messages between the Mac and a phone are end-to-end encrypted: an X25519
// key exchange between the two devices' box keys, HKDF-SHA256, then
// XChaCha20-Poly1305. The relay IDs of sender and recipient are bound in as
// associated data, so the relay can't redirect a message to someone else.

const hkdfInfo = "agentdeck-e2e-v1"

// envelope is the "data" of a relay frame. K is the sender's box public key.
type envelope struct {
	K string `json:"k"`
	N string `json:"n"`
	C string `json:"c"`
}

var errOpen = errors.New("remote: cannot open message")

func sharedKey(priv *ecdh.PrivateKey, peer *ecdh.PublicKey) ([]byte, error) {
	secret, err := priv.ECDH(peer)
	if err != nil {
		return nil, err
	}
	return hkdf.Key(sha256.New, secret, nil, hkdfInfo, chacha20poly1305.KeySize)
}

func aad(from, to string) []byte { return []byte(from + ">" + to) }

func seal(priv *ecdh.PrivateKey, peer *ecdh.PublicKey, from, to string, plain []byte) (string, error) {
	key, err := sharedKey(priv, peer)
	if err != nil {
		return "", err
	}
	aead, err := chacha20poly1305.NewX(key)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aead.NonceSize())
	rand.Read(nonce)
	b, err := json.Marshal(envelope{
		K: b64(priv.PublicKey().Bytes()),
		N: b64(nonce),
		C: b64(aead.Seal(nil, nonce, plain, aad(from, to))),
	})
	return string(b), err
}

// open decrypts a message and returns the sender's box key with it.
func open(priv *ecdh.PrivateKey, from, to, data string) (*ecdh.PublicKey, string, []byte, error) {
	var e envelope
	if json.Unmarshal([]byte(data), &e) != nil {
		return nil, "", nil, errOpen
	}
	kb, err1 := unb64(e.K)
	nonce, err2 := unb64(e.N)
	c, err3 := unb64(e.C)
	if err1 != nil || err2 != nil || err3 != nil {
		return nil, "", nil, errOpen
	}
	peer, err := ecdh.X25519().NewPublicKey(kb)
	if err != nil {
		return nil, "", nil, errOpen
	}
	key, err := sharedKey(priv, peer)
	if err != nil {
		return nil, "", nil, errOpen
	}
	aead, _ := chacha20poly1305.NewX(key)
	if len(nonce) != aead.NonceSize() {
		return nil, "", nil, errOpen
	}
	plain, err := aead.Open(nil, nonce, c, aad(from, to))
	if err != nil {
		return nil, "", nil, errOpen
	}
	return peer, e.N, plain, nil
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func unb64(s string) ([]byte, error) { return base64.RawURLEncoding.DecodeString(s) }
