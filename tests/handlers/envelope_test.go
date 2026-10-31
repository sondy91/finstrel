package handlers_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"finstrel/internal/handlers"
	"finstrel/internal/models"
)

// MockEnvelopeRepository is a mock implementation of the EnvelopeRepository interface
type MockEnvelopeRepository struct {
	mock.Mock
}

func (m *MockEnvelopeRepository) Create(envelope *models.Envelope) error {
	args := m.Called(envelope)
	return args.Error(0)
}

func (m *MockEnvelopeRepository) GetByID(id int64) (*models.Envelope, error) {
	args := m.Called(id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Envelope), args.Error(1)
}

func (m *MockEnvelopeRepository) Update(envelope *models.Envelope) error {
	args := m.Called(envelope)
	return args.Error(0)
}

func (m *MockEnvelopeRepository) Delete(id int64) error {
	args := m.Called(id)
	return args.Error(0)
}

func (m *MockEnvelopeRepository) ListByBudgetPeriod(periodID int64) ([]*models.Envelope, error) {
	args := m.Called(periodID)
	return args.Get(0).([]*models.Envelope), args.Error(1)
}

func (m *MockEnvelopeRepository) ListAll() ([]*models.Envelope, error) {
	args := m.Called()
	return args.Get(0).([]*models.Envelope), args.Error(1)
}

func TestEnvelopeHandlers(t *testing.T) {
	// Common test data
	now := time.Now()
	category := &models.Category{
		ID:   1,
		Name: "Groceries",
		Type: "Expense",
	}

	period := &models.BudgetPeriod{
		ID:        1,
		Name:      "August 2025",
		StartDate: now,
		EndDate:   now.AddDate(0, 1, 0),
		Status:    "active",
	}

	t.Run("CreateEnvelope", func(t *testing.T) {
		repo := new(MockEnvelopeRepository)
		h := handlers.NewEnvelopeHandler(repo)

		tests := []struct {
			name       string
			envelope   *models.Envelope
			setupMock  func()
			expectErr  bool
			expectID   int64
			expectName string
		}{
			{
				name: "Successfully create envelope",
				envelope: &models.Envelope{
					Name:           "Groceries",
					Category:       category,
					BudgetedAmount: 500.00,
					Period:         period,
					Status:         "active",
				},
				setupMock: func() {
					repo.On("Create", mock.AnythingOfType("*models.Envelope")).
						Return(nil).
						Run(func(args mock.Arguments) {
							e := args.Get(0).(*models.Envelope)
							e.ID = 1
						})
				},
				expectErr:  false,
				expectID:   1,
				expectName: "Groceries",
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				tt.setupMock()

				env, err := h.CreateEnvelope(context.Background(), &handlers.CreateEnvelopeRequest{
					Name:           tt.envelope.Name,
					CategoryID:     tt.envelope.Category.ID,
					BudgetedAmount: tt.envelope.BudgetedAmount,
					BudgetPeriodID: tt.envelope.Period.ID,
					Status:         tt.envelope.Status,
				})

				if tt.expectErr {
					assert.Error(t, err)
					assert.Nil(t, env)
				} else {
					assert.NoError(t, err)
					assert.NotNil(t, env)
					assert.Equal(t, tt.expectID, env.ID)
					assert.Equal(t, tt.expectName, env.Name)
				}

				repo.AssertExpectations(t)
			})
		}
	})

	t.Run("GetEnvelope", func(t *testing.T) {
		repo := new(MockEnvelopeRepository)
		h := handlers.NewEnvelopeHandler(repo)

		envelope := &models.Envelope{
			ID:             1,
			Name:           "Groceries",
			Category:       category,
			BudgetedAmount: 500.00,
			Period:         period,
			Status:         "active",
		}

		repo.On("GetByID", int64(1)).Return(envelope, nil)
		repo.On("GetByID", int64(999)).Return(nil, fmt.Errorf("not found"))

		tests := []struct {
			name         string
			id           int64
			expectError  bool
			expectResult *models.Envelope
		}{
			{
				name:         "Get existing envelope",
				id:           1,
				expectError:  false,
				expectResult: envelope,
			},
			{
				name:         "Non-existent envelope",
				id:           999,
				expectError:  true,
				expectResult: nil,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				result, err := h.GetEnvelope(context.Background(), tt.id)

				if tt.expectError {
					assert.Error(t, err)
				} else {
					assert.NoError(t, err)
					assert.Equal(t, tt.expectResult, result)
				}
			})
		}
	})
}
