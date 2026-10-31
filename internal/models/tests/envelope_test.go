package tests

import (
	"testing"
	"time"

	"finstrel/internal/models"
	"github.com/stretchr/testify/assert"
)

func TestEnvelopeLifecycle(t *testing.T) {
	tests := []struct {
		name           string
		envelopeName    string
		categoryType   string
		initialBudget  float64
		transactions   []float64
		expectedRemaining float64
		expectedStatus   string
	}{
		{
			name:           "Food budget with single expense",
			envelopeName:    "Groceries",
			categoryType:   "Expense",
			initialBudget:  200.00,
			transactions:   []float64{-50.00},
			expectedRemaining: 150.00,
			expectedStatus:   "active",
		},
		{
			name:           "Multiple transactions",
			envelopeName:    "Entertainment",
			categoryType:   "Expense",
			initialBudget:  100.00,
			transactions:   []float64{-20.00, -15.50, -10.00},
			expectedRemaining: 54.50,
			expectedStatus:   "active",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create a new budget period
			period := &models.BudgetPeriod{
				Name:      "August 2025 Budget",
				StartDate: time.Date(2025, 8, 1, 0, 0, 0, 0, time.UTC),
				EndDate:   time.Date(2025, 8, 31, 23, 59, 59, 0, time.UTC),
				Status:    "active",
			}

			// Create a category for this envelope
			category := &models.Category{
				Name: tt.envelopeName,
				Type: tt.categoryType,
			}

			// This will fail because we haven't implemented the Envelope model yet
			envelope := &models.Envelope{
				Name:           tt.envelopeName,
				Category:       category,
				BudgetedAmount: tt.initialBudget,
				Period:         period,
				Status:         "active",
			}

			// Test initial state
			assert.Equal(t, tt.envelopeName, envelope.Name)
			assert.Equal(t, tt.initialBudget, envelope.BudgetedAmount)
			assert.Equal(t, 0.0, envelope.Spent())
			assert.Equal(t, tt.initialBudget, envelope.Remaining())

			// Process transactions
			for _, amount := range tt.transactions {
				transaction := &models.Transaction{
					Amount:     amount,
					CategoryID: category.ID,
					Date:       time.Now(),
					Type:       "Expense",
				}
				envelope.AddTransaction(transaction)
			}

			// Verify final state
			assert.InDelta(t, tt.expectedRemaining, envelope.Remaining(), 0.01, "remaining amount should match expected")
			assert.Equal(t, tt.expectedStatus, envelope.Status)
		})
	}
}

func TestEnvelopeStatusUpdates(t *testing.T) {
	tests := []struct {
		name          string
		initialStatus string
		actions       func(*models.Envelope)
		expectedStatus string
	}{
		{
			name:          "Pause active envelope",
			initialStatus: "active",
			actions: func(e *models.Envelope) {
				e.Pause()
			},
			expectedStatus: "paused",
		},
		{
			name:          "Resume paused envelope",
			initialStatus: "paused",
			actions: func(e *models.Envelope) {
				e.Resume()
			},
			expectedStatus: "active",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			envelope := &models.Envelope{
				Name:   "Test Envelope",
				Status: tt.initialStatus,
			}

			tt.actions(envelope)
			assert.Equal(t, tt.expectedStatus, envelope.Status)
		})
	}
}
