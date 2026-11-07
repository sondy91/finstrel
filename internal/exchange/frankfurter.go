// Package exchange retrieves historical reference rates without sending transaction data.
package exchange

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var currencyCode = regexp.MustCompile(`^[A-Z]{3}$`)

// Rate records the observation date, which may precede a weekend or holiday.
type Rate struct {
	Date  string  `json:"date"`
	Base  string  `json:"base"`
	Quote string  `json:"quote"`
	Rate  float64 `json:"rate"`
}

// Client retrieves daily blended Frankfurter rates. The caller chooses when to
// persist an observation; this type never stores or submits financial amounts.
type Client struct {
	HTTP    *http.Client
	BaseURL string
}

func (c Client) HistoricalUSD(ctx context.Context, base, date string) (Rate, error) {
	base = strings.ToUpper(strings.TrimSpace(base))
	if !currencyCode.MatchString(base) || base == "USD" {
		return Rate{}, fmt.Errorf("invalid foreign currency")
	}
	requested, err := time.Parse("2006-01-02", date)
	if err != nil || requested.Format("2006-01-02") != date {
		return Rate{}, fmt.Errorf("invalid transaction date")
	}
	root := c.BaseURL
	if root == "" {
		root = "https://api.frankfurter.dev"
	}
	endpoint, err := url.Parse(root)
	if err != nil || endpoint.Host == "" || (endpoint.Scheme != "https" && endpoint.Scheme != "http") {
		return Rate{}, fmt.Errorf("invalid exchange service URL")
	}
	endpoint.Path = strings.TrimRight(endpoint.Path, "/") + "/v2/rate/" + base + "/USD"
	q := endpoint.Query()
	q.Set("date", date)
	endpoint.RawQuery = q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return Rate{}, err
	}
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return Rate{}, fmt.Errorf("exchange rate unavailable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Rate{}, fmt.Errorf("exchange rate unavailable (HTTP %d)", resp.StatusCode)
	}
	var result Rate
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&result); err != nil {
		return Rate{}, fmt.Errorf("invalid exchange rate response")
	}
	observed, err := time.Parse("2006-01-02", result.Date)
	if err != nil || result.Base != base || result.Quote != "USD" || math.IsNaN(result.Rate) || math.IsInf(result.Rate, 0) || result.Rate <= 0 || observed.After(requested) || requested.Sub(observed) > 7*24*time.Hour {
		return Rate{}, fmt.Errorf("invalid or stale exchange rate")
	}
	return result, nil
}
