package handlers

import (
	"context"
	"finstrel/internal/models"
)

// EnvelopeRepository defines the interface for envelope data operations
type EnvelopeRepository interface {
	Create(envelope *models.Envelope) error
	GetByID(id int64) (*models.Envelope, error)
	Update(envelope *models.Envelope) error
	Delete(id int64) error
	ListAll() ([]*models.Envelope, error)
	ListByBudgetPeriod(periodID int64) ([]*models.Envelope, error)
}

// EnvelopeHandler handles envelope-related HTTP requests
type EnvelopeHandler struct {
	repo EnvelopeRepository
}

// NewEnvelopeHandler creates a new EnvelopeHandler
func NewEnvelopeHandler(repo EnvelopeRepository) *EnvelopeHandler {
	return &EnvelopeHandler{
		repo: repo,
	}
}

// CreateEnvelopeRequest represents the request to create a new envelope
type CreateEnvelopeRequest struct {
	Name           string  `json:"name" validate:"required"`
	CategoryID     int64   `json:"categoryId" validate:"required,gt=0"`
	BudgetedAmount float64 `json:"budgetedAmount" validate:"gt=0"`
	BudgetPeriodID int64   `json:"budgetPeriodId" validate:"required,gt=0"`
	Status         string  `json:"status" validate:"oneof=active paused archived"`
}

// CreateEnvelope handles the creation of a new envelope
func (h *EnvelopeHandler) CreateEnvelope(ctx context.Context, req *CreateEnvelopeRequest) (*models.Envelope, error) {
	// Get category and budget period (you'll need to implement these repository methods)
	// For now, we'll create a basic envelope
	
	envelope := &models.Envelope{
		Name:           req.Name,
		BudgetedAmount: req.BudgetedAmount,
		Status:         req.Status,
		// Note: In a real implementation, you would fetch these related entities
		// from their respective repositories
		Category: &models.Category{ID: req.CategoryID},
		Period:   &models.BudgetPeriod{ID: req.BudgetPeriodID},
	}

	if err := h.repo.Create(envelope); err != nil {
		return nil, err
	}

	return envelope, nil
}

// GetEnvelope retrieves an envelope by ID
func (h *EnvelopeHandler) GetEnvelope(ctx context.Context, id int64) (*models.Envelope, error) {
	return h.repo.GetByID(id)
}

// UpdateEnvelopeRequest represents the request to update an envelope
type UpdateEnvelopeRequest struct {
	ID             int64   `json:"-"` // From URL parameter
	Name           string  `json:"name"`
	BudgetedAmount float64 `json:"budgetedAmount"`
	Status         string  `json:"status" validate:"omitempty,oneof=active paused archived"`
}

// UpdateEnvelope updates an existing envelope
func (h *EnvelopeHandler) UpdateEnvelope(ctx context.Context, req *UpdateEnvelopeRequest) (*models.Envelope, error) {
	envelope, err := h.repo.GetByID(req.ID)
	if err != nil {
		return nil, err
	}

	// Update fields if they're provided in the request
	if req.Name != "" {
		envelope.Name = req.Name
	}
	if req.BudgetedAmount > 0 {
		envelope.BudgetedAmount = req.BudgetedAmount
	}
	if req.Status != "" {
		envelope.Status = req.Status
	}

	if err := h.repo.Update(envelope); err != nil {
		return nil, err
	}

	return envelope, nil
}

// DeleteEnvelope deletes an envelope by ID
func (h *EnvelopeHandler) DeleteEnvelope(ctx context.Context, id int64) error {
	return h.repo.Delete(id)
}

// ListEnvelopesByBudgetPeriod retrieves all envelopes for a specific budget period
func (h *EnvelopeHandler) ListEnvelopesByBudgetPeriod(ctx context.Context, periodID int64) ([]*models.Envelope, error) {
	return h.repo.ListByBudgetPeriod(periodID)
}
