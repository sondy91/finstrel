package bankfeed

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/joho/godotenv"
	plaid "github.com/plaid/plaid-go/v49"
)

// Explicit opt-in only: this creates simulated Sandbox Items and revokes each
// one afterward. It never prints provider responses, tokens, or credentials.
func TestSandboxPersonas(t *testing.T) {
	if os.Getenv("VESTRA_PLAID_SANDBOX_TEST") != "1" {
		t.Skip("opt-in Sandbox API check")
	}
	if err := godotenv.Load("../../.env"); err != nil {
		t.Fatal("Sandbox backend settings are unavailable")
	}
	if os.Getenv("PLAID_ENV") != "sandbox" {
		t.Fatal("This check requires PLAID_ENV=sandbox")
	}
	if os.Getenv("PLAID_CLIENT_ID") == "" || os.Getenv("PLAID_SECRET") == "" {
		t.Fatal("Sandbox backend keys are missing")
	}
	p := newProvider(os.Getenv("PLAID_CLIENT_ID"), os.Getenv("PLAID_SECRET"), "sandbox")
	for _, persona := range []string{"user_good", "user_transactions_dynamic"} {
		t.Run(persona, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
			defer cancel()
			password := "pass_good"
			request := &plaid.SandboxPublicTokenCreateRequest{InstitutionID: "ins_109508", InitialProducts: []plaid.Products{plaid.ProductsTransactions, plaid.ProductsLiabilities, plaid.ProductsInvestments}, Options: &plaid.SandboxPublicTokenCreateRequestOptions{OverrideUsername: &persona, OverridePassword: &password}}
			created, err := p.sdk.Sandbox.CreatePublicToken(ctx, request)
			if err != nil {
				t.Fatal(sanitizeError(err))
			}
			exchanged, err := p.exchange(ctx, created.PublicToken)
			if err != nil {
				t.Fatal(err)
			}
			defer func() {
				cleanup, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				defer cancel()
				if err := p.remove(cleanup, exchanged.AccessToken); err != nil {
					t.Error("Sandbox cleanup failed:", err)
				}
			}()
			secrets := &memoryCredentials{values: map[string]string{}}
			s := &Service{provider: p, environment: "sandbox", vault: newVault(t.TempDir(), "sandbox", secrets)}
			id := "sandbox-persona"
			if err = s.vault.putConnection(id, connectionCredential{Token: exchanged.AccessToken, ProviderID: exchanged.ItemID}); err != nil {
				t.Fatal(err)
			}
			if err = s.vault.save(snapshot{Version: 1, UserID: "sandbox-test", Items: []record{{Item: emptyItem(id, "Sandbox persona"), ProviderID: exchanged.ItemID}}}); err != nil {
				t.Fatal(err)
			}
			view, err := s.Import(ctx)
			if err != nil {
				t.Fatal(err)
			}
			item := view.Items[0]
			if len(item.Accounts) == 0 || item.Status == "error" {
				t.Fatal("Sandbox import did not return accounts:", item.Notice)
			}
			t.Logf("simulated accounts=%d spending=%d debt=%d holdings=%d investment_activity=%d", len(item.Accounts), len(item.Transactions), len(item.Liabilities), len(item.Holdings), len(item.InvestmentTransactions))
			if item.Notice != "" {
				t.Log("Some product data is not ready or supported; the app displays a retry/coverage notice.")
			}
			state, err := s.vault.load()
			if err != nil {
				t.Fatal(err)
			}
			before := state.Items[0].Cursor
			// One explicit later import models the approved manual retry after the
			// Sandbox has had time to prepare history. This is test-only.
			if len(item.Transactions) == 0 {
				select {
				case <-ctx.Done():
					t.Fatal("Sandbox check timed out")
				case <-time.After(30 * time.Second):
				}
			}
			view, err = s.Import(ctx)
			if err != nil {
				t.Fatal(err)
			}
			t.Logf("later manual import: spending=%d status=%s", len(view.Items[0].Transactions), view.Items[0].Status)
			if len(view.Items[0].Transactions) == 0 {
				t.Log("Transaction history remains pending: " + view.Items[0].Notice)
			}
			seen := map[string]bool{}
			for _, row := range view.Items[0].Transactions {
				if seen[row.ID] {
					t.Fatal("duplicate transaction after second import")
				}
				seen[row.ID] = true
			}
			state, err = s.vault.load()
			if err != nil {
				t.Fatal(err)
			}
			if before != "" && state.Items[0].Cursor == "" {
				t.Fatal("committed cursor was lost")
			}
		})
	}
}

func TestDesktopSandboxConfig(t *testing.T) {
	if os.Getenv("VESTRA_PLAID_CONFIG_TEST") != "1" {
		t.Skip("opt-in private desktop settings check")
	}
	if os.Getenv("PLAID_CLIENT_ID") != "" || os.Getenv("PLAID_SECRET") != "" {
		t.Skip("process already configured; cannot prove private settings load")
	}
	s, err := New(nil)
	if err != nil {
		t.Fatal(err)
	}
	if s.provider == nil || s.environment != "sandbox" {
		t.Fatal("private desktop Sandbox settings did not load")
	}
	t.Log("Desktop Sandbox settings loaded outside the project working directory without displaying values.")
}
