package main

import (
	"context"
	"finstrel/internal/bankfeed"
	"finstrel/internal/database"
	"fmt"
	"time"

	"github.com/pkg/browser"
)

// SetBankTransactionCategory assigns an existing budget category, or clears it with zero.
func (a *App) SetBankTransactionCategory(itemID, transactionID string, categoryID int64) (bankfeed.View, error) {
	if categoryID < 0 {
		return bankfeed.View{}, fmt.Errorf("invalid category")
	}
	if categoryID != 0 {
		categories, err := database.GetCategories()
		if err != nil {
			return bankfeed.View{}, err
		}
		found := false
		for _, category := range categories {
			if category.ID == categoryID {
				found = true
				break
			}
		}
		if !found {
			return bankfeed.View{}, fmt.Errorf("category not found")
		}
	}
	s, err := a.bankService()
	if err != nil {
		return bankfeed.View{}, err
	}
	return s.SetTransactionCategory(itemID, transactionID, categoryID)
}

func (a *App) bankService() (*bankfeed.Service, error) {
	a.bankMu.Lock()
	defer a.bankMu.Unlock()
	if a.bankFeeds == nil {
		service, err := bankfeed.New(browser.OpenURL)
		if err != nil {
			return nil, err
		}
		a.bankFeeds = service
	}
	return a.bankFeeds, nil
}

func (a *App) bankContext() (context.Context, context.CancelFunc) {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return context.WithTimeout(ctx, 5*time.Minute)
}

func (a *App) GetBankFeedView() (bankfeed.View, error) {
	s, err := a.bankService()
	if err != nil {
		return bankfeed.View{}, err
	}
	return s.View()
}

func (a *App) StartBankLink(itemID string) (string, error) {
	s, err := a.bankService()
	if err != nil {
		return "", err
	}
	ctx, cancel := a.bankContext()
	defer cancel()
	return s.StartLink(ctx, itemID)
}

func (a *App) FinishBankLink(sessionID string) (bankfeed.View, error) {
	s, err := a.bankService()
	if err != nil {
		return bankfeed.View{}, err
	}
	ctx, cancel := a.bankContext()
	defer cancel()
	return s.FinishLink(ctx, sessionID)
}

func (a *App) ImportBankFeeds() (bankfeed.View, error) {
	s, err := a.bankService()
	if err != nil {
		return bankfeed.View{}, err
	}
	ctx, cancel := a.bankContext()
	defer cancel()
	return s.Import(ctx)
}

func (a *App) CancelBankLink(sessionID string) (bankfeed.View, error) {
	s, err := a.bankService()
	if err != nil {
		return bankfeed.View{}, err
	}
	return s.CancelLink(sessionID)
}

func (a *App) DisconnectBankFeed(itemID string) (bankfeed.View, error) {
	s, err := a.bankService()
	if err != nil {
		return bankfeed.View{}, err
	}
	ctx, cancel := a.bankContext()
	defer cancel()
	return s.Disconnect(ctx, itemID)
}

// ImportBankFeed refreshes one linked institution without affecting others.
func (a *App) ImportBankFeed(itemID string) (bankfeed.View, error) {
	s, err := a.bankService()
	if err != nil {
		return bankfeed.View{}, err
	}
	ctx, cancel := a.bankContext()
	defer cancel()
	return s.ImportItem(ctx, itemID)
}
