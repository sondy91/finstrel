package main

import (
	"finstrel/internal/database"
	"fmt"
)

func (a *App) GetBankAccountLabels() ([]database.BankAccountLabel, error) {
	return database.GetBankAccountLabels()
}

func (a *App) SetBankAccountLabel(itemID, accountID, label string) error {
	read := a.GetBankFeedView
	if a.bankView != nil {
		read = a.bankView
	}
	view, err := read()
	if err != nil {
		return err
	}
	for _, item := range append(view.Items, view.ArchivedItems...) {
		if item.ID != itemID {
			continue
		}
		for _, account := range item.Accounts {
			if account.ID == accountID {
				return database.SetBankAccountLabel(itemID, accountID, label)
			}
		}
	}
	return fmt.Errorf("bank account not found; refresh and try again")
}
