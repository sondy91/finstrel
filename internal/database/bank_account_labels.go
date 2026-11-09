package database

import (
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"
)

// BankAccountLabel is household-owned metadata; it does not imply bank-login access.
type BankAccountLabel struct {
	ItemID    string `json:"itemId"`
	AccountID string `json:"accountId"`
	Label     string `json:"label"`
}

func GetBankAccountLabels() ([]BankAccountLabel, error) {
	rows, err := GetDB().Query(`SELECT item_id, account_id, label FROM bank_account_labels ORDER BY item_id, account_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	labels := []BankAccountLabel{}
	for rows.Next() {
		var label BankAccountLabel
		if err := rows.Scan(&label.ItemID, &label.AccountID, &label.Label); err != nil {
			return nil, err
		}
		labels = append(labels, label)
	}
	return labels, rows.Err()
}

func SetBankAccountLabel(itemID, accountID, label string) error {
	if strings.TrimSpace(itemID) == "" || strings.TrimSpace(accountID) == "" || len(itemID) > 256 || len(accountID) > 256 {
		return fmt.Errorf("invalid bank account")
	}
	label = strings.TrimSpace(label)
	if !utf8.ValidString(label) || utf8.RuneCountInString(label) > 80 || strings.IndexFunc(label, unicode.IsControl) >= 0 {
		return fmt.Errorf("enter an owner label of at most 80 characters")
	}
	if label == "" {
		_, err := GetDB().Exec(`DELETE FROM bank_account_labels WHERE item_id=? AND account_id=?`, itemID, accountID)
		return err
	}
	_, err := GetDB().Exec(`INSERT INTO bank_account_labels(item_id,account_id,label) VALUES(?,?,?) ON CONFLICT(item_id,account_id) DO UPDATE SET label=excluded.label`, itemID, accountID, label)
	return err
}
