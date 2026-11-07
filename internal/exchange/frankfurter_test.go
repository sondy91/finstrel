package exchange

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func clientWithResponse(t *testing.T, body string) Client {
	return Client{HTTP: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		require.Equal(t, "/v2/rate/EUR/USD", r.URL.Path)
		require.Equal(t, "2024-01-06", r.URL.Query().Get("date"))
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}}
}
func TestHistoricalUSD(t *testing.T) {
	rate, err := clientWithResponse(t, `{"date":"2024-01-05","base":"EUR","quote":"USD","rate":1.09}`).HistoricalUSD(context.Background(), "eur", "2024-01-06")
	require.NoError(t, err)
	require.Equal(t, "2024-01-05", rate.Date)
	require.Equal(t, 1.09, rate.Rate)
}
func TestHistoricalUSDRejectsUnsafeRates(t *testing.T) {
	for _, body := range []string{
		`{"date":"2023-12-01","base":"EUR","quote":"USD","rate":1}`,
		`{"date":"2024-01-07","base":"EUR","quote":"USD","rate":1}`,
		`{"date":"2024-01-06","base":"GBP","quote":"USD","rate":1}`,
		`{"date":"2024-01-06","base":"EUR","quote":"USD","rate":0}`,
		`not json`,
	} {
		t.Run(body, func(t *testing.T) {
			_, err := clientWithResponse(t, body).HistoricalUSD(context.Background(), "EUR", "2024-01-06")
			require.Error(t, err)
		})
	}
	_, err := (Client{}).HistoricalUSD(context.Background(), "../USD", "2024-01-06")
	require.Error(t, err)
}
