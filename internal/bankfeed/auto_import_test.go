package bankfeed

import (
	"context"
	"testing"
	"time"
)

func TestImportItemOnlyUpdatesSelectedBank(t *testing.T) {
	calls := map[string]int{}
	s, _ := fixtureService(t, func(path string, request map[string]any) (int, any) {
		if path == "/accounts/get" {
			return 200, map[string]any{"accounts": []any{}}
		}
		t.Errorf("unexpected endpoint: %s", path)
		return apiFailure("UNEXPECTED")
	}, func(path string, request map[string]any) (int, any) {
		if path != "/item/get" {
			return 0, nil
		}
		calls[request["access_token"].(string)]++
		return 200, map[string]any{"item": map[string]any{"item_id": "provider", "error": nil}}
	})
	first, second := emptyItem("one", "First"), emptyItem("two", "Second")
	if err := s.vault.putToken("one", "fixture-one"); err != nil {
		t.Fatal(err)
	}
	if err := s.vault.putToken("two", "fixture-two"); err != nil {
		t.Fatal(err)
	}
	if err := s.vault.save(snapshot{Version: 1, Items: []record{{Item: first}, {Item: second}}}); err != nil {
		t.Fatal(err)
	}
	view, err := s.ImportItem(context.Background(), "one")
	if err != nil {
		t.Fatal(err)
	}
	if calls["fixture-one"] != 1 || calls["fixture-two"] != 0 {
		t.Fatalf("unexpected bank requests: %v", calls)
	}
	if view.Items[0].LastImported == "" || view.Items[1].LastImported != "" {
		t.Fatal("refresh modified the wrong bank")
	}
	if _, err := s.ImportItem(context.Background(), "missing"); err == nil {
		t.Fatal("missing bank accepted")
	}
}

func TestAutoImportSkipsPendingSession(t *testing.T) {
	calls := 0
	s, _ := fixtureService(t, func(path string, request map[string]any) (int, any) { calls++; return apiFailure("UNEXPECTED") })
	item := emptyItem("one", "First")
	if err := s.vault.putToken("one", "fixture-one"); err != nil {
		t.Fatal(err)
	}
	if err := s.vault.save(snapshot{Version: 1, Items: []record{{Item: item}}, Session: &linkSession{ID: "pending", Expires: time.Now().Add(time.Hour)}}); err != nil {
		t.Fatal(err)
	}
	view, err := s.AutoImport(context.Background())
	if err != nil || view.PendingSession != "pending" || calls != 0 {
		t.Fatalf("pending session changed or attempted network call: %+v, %v, %d", view, err, calls)
	}
}

func TestAutoImportSkipsWhenNotConfigured(t *testing.T) {
	secrets := &memoryCredentials{values: map[string]string{}}
	s := &Service{environment: "sandbox", vault: newVault(t.TempDir(), "sandbox", secrets)}
	view, err := s.AutoImport(context.Background())
	if err != nil || view.Configured || len(view.Items) != 0 {
		t.Fatalf("unexpected result: %+v, %v", view, err)
	}
}

func TestAutoImportRefreshesExistingBanks(t *testing.T) {
	calls := 0
	s, _ := fixtureService(t, func(path string, request map[string]any) (int, any) {
		if path == "/accounts/get" {
			calls++
			return 200, map[string]any{"accounts": []any{}}
		}
		t.Errorf("unexpected endpoint: %s", path)
		return apiFailure("UNEXPECTED")
	})
	item := emptyItem("one", "First")
	if err := s.vault.putToken("one", "fixture-one"); err != nil {
		t.Fatal(err)
	}
	if err := s.vault.save(snapshot{Version: 1, Items: []record{{Item: item}}}); err != nil {
		t.Fatal(err)
	}
	view, err := s.AutoImport(context.Background())
	if err != nil || calls != 1 || len(view.Items) != 1 || view.Items[0].LastImported == "" {
		t.Fatalf("startup sync failed: %+v, %v, calls=%d", view, err, calls)
	}
}

func TestImportItemDoesNotInterruptPendingSession(t *testing.T) {
	s, _ := fixtureService(t, func(path string, request map[string]any) (int, any) {
		t.Fatal("unexpected network request")
		return apiFailure("UNEXPECTED")
	})
	item := emptyItem("one", "First")
	if err := s.vault.save(snapshot{Version: 1, Items: []record{{Item: item}}, Session: &linkSession{ID: "pending"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ImportItem(context.Background(), "one"); err == nil {
		t.Fatal("refresh should not interrupt sign-in")
	}
}
