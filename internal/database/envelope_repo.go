package database

import (
	"database/sql"
	"time"

	"finstrel/internal/models"
)

// EnvelopeRepository implements the handlers.EnvelopeRepository interface
type EnvelopeRepository struct {
	db *sql.DB
}

func NewEnvelopeRepository(db *sql.DB) *EnvelopeRepository {
	return &EnvelopeRepository{db: db}
}

func (r *EnvelopeRepository) Create(envelope *models.Envelope) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}

	// Set timestamps
	now := time.Now().UTC()
	envelope.CreatedAt = now
	envelope.UpdatedAt = now

	// Insert the envelope
	result, err := tx.Exec(`
		INSERT INTO envelopes (
			name,
			category_id,
			budgeted_amount,
			budget_period_id,
			status,
			created_at,
			updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		envelope.Name,
		envelope.Category.ID,
		envelope.BudgetedAmount,
		envelope.Period.ID,
		envelope.Status,
		envelope.CreatedAt.Format(time.RFC3339),
		envelope.UpdatedAt.Format(time.RFC3339),
	)

	if err != nil {
		tx.Rollback()
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		tx.Rollback()
		return err
	}
	envelope.ID = id

	return tx.Commit()
}

func (r *EnvelopeRepository) GetByID(id int64) (*models.Envelope, error) {
	envelope := &models.Envelope{}
	var categoryID, periodID int64
	var createdAt, updatedAt string

	err := r.db.QueryRow(`
		SELECT
			e.id, e.name, e.category_id, e.budgeted_amount,
			e.budget_period_id, e.status, e.created_at, e.updated_at
		FROM envelopes e
		WHERE e.id = ?`, id).
		Scan(
			&envelope.ID, &envelope.Name, &categoryID, &envelope.BudgetedAmount,
			&periodID, &envelope.Status, &createdAt, &updatedAt,
		)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // Not found
		}
		return nil, err
	}

	// Parse timestamps
	envelope.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	envelope.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)

	// Set related objects (just IDs for now, can be loaded if needed)
	envelope.Category = &models.Category{ID: categoryID}
	envelope.Period = &models.BudgetPeriod{ID: periodID}

	return envelope, nil
}

func (r *EnvelopeRepository) Update(envelope *models.Envelope) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}

	// Update timestamp
	envelope.UpdatedAt = time.Now().UTC()

	// Update the envelope
	_, err = tx.Exec(`
		UPDATE envelopes
		SET
			name = ?,
			category_id = ?,
			budgeted_amount = ?,
			budget_period_id = ?,
			status = ?,
			updated_at = ?
		WHERE id = ?`,
		envelope.Name,
		envelope.Category.ID,
		envelope.BudgetedAmount,
		envelope.Period.ID,
		envelope.Status,
		envelope.UpdatedAt.Format(time.RFC3339),
		envelope.ID,
	)

	if err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit()
}

func (r *EnvelopeRepository) Delete(id int64) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}

	// Delete the envelope
	_, err = tx.Exec(`DELETE FROM envelopes WHERE id = ?`, id)
	if err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit()
}

// ListByBudgetPeriod retrieves all envelopes for a specific budget period
func (r *EnvelopeRepository) ListByBudgetPeriod(periodID int64) ([]*models.Envelope, error) {
	rows, err := r.db.Query(`
		SELECT
			e.id, e.name, e.category_id, e.budgeted_amount,
			e.budget_period_id, e.status, e.created_at, e.updated_at
		FROM envelopes e
		WHERE e.budget_period_id = ?
		ORDER BY e.name`, periodID)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var envelopes []*models.Envelope

	for rows.Next() {
		envelope := &models.Envelope{}
		var categoryID, periodID int64
		var createdAt, updatedAt string

		err := rows.Scan(
			&envelope.ID, &envelope.Name, &categoryID, &envelope.BudgetedAmount,
			&periodID, &envelope.Status, &createdAt, &updatedAt,
		)
		if err != nil {
			return nil, err
		}

		// Parse timestamps
		envelope.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
		envelope.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)

		// Set related objects (just IDs for now)
		envelope.Category = &models.Category{ID: categoryID}
		envelope.Period = &models.BudgetPeriod{ID: periodID}

		envelopes = append(envelopes, envelope)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return envelopes, nil
}
