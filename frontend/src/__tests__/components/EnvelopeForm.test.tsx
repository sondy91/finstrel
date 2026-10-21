import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import EnvelopeForm from '../../components/EnvelopeForm';

vi.mock('../../wailsAdapter', () => ({
  CreateEnvelope: vi.fn(),
}));

import * as Adapter from '../../wailsAdapter';

describe('EnvelopeForm', () => {
  const categories = [
    { id: 1, name: 'Groceries', type: 'Expense' },
    { id: 2, name: 'Rent', type: 'Expense' },
  ];

  const setup = (props?: Partial<React.ComponentProps<typeof EnvelopeForm>>) => {
    const onClose = vi.fn();
    const onEnvelopeCreated = vi.fn();
    render(
      <EnvelopeForm
        open={true}
        onClose={onClose}
        onEnvelopeCreated={onEnvelopeCreated}
        categories={categories}
        {...props}
      />
    );
    return { onClose, onEnvelopeCreated };
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('validates empty fields', async () => {
    setup();
    const submit = await screen.findByRole('button', { name: /Create Envelope/i });
    await userEvent.click(submit);

    expect(await screen.findByText(/Please fill in all fields/i)).toBeInTheDocument();
  });

  it.each(['0', '-1'])('blocks non-positive amount %s before creation', async (value) => {
    const { onClose, onEnvelopeCreated } = setup();

    await userEvent.type(screen.getByLabelText(/Envelope Name/i), 'Food');
    await userEvent.click(screen.getByLabelText(/Category/i));
    // Select first category by option name
    await userEvent.click(await screen.findByRole('option', { name: 'Groceries' }));
    const amount = screen.getByRole('spinbutton', { name: /Budgeted Amount/i });
    await userEvent.type(amount, value);

    await userEvent.click(screen.getByRole('button', { name: /Create Envelope/i }));

    expect(amount).toBeInvalid();
    expect((amount as HTMLInputElement).validity.rangeUnderflow).toBe(true);
    expect(Adapter.CreateEnvelope).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onEnvelopeCreated).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('submits successfully and calls callbacks', async () => {
    (Adapter.CreateEnvelope as unknown as Mock).mockResolvedValueOnce({});
    const { onClose, onEnvelopeCreated } = setup();

    await userEvent.type(screen.getByLabelText(/Envelope Name/i), 'Food');

    // Open select and choose category
    await userEvent.click(screen.getByLabelText(/Category/i));
    await userEvent.click(await screen.findByRole('option', { name: 'Groceries' }));

    await userEvent.type(screen.getByLabelText(/Budgeted Amount/i), '123.45');

    await userEvent.click(screen.getByRole('button', { name: /Create Envelope/i }));

    expect(Adapter.CreateEnvelope).toHaveBeenCalledWith({
      name: 'Food',
      category_id: 1,
      amount: 123.45,
    });
    expect(onEnvelopeCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows error when creation fails', async () => {
    (Adapter.CreateEnvelope as unknown as Mock).mockRejectedValueOnce(new Error('boom'));
    setup();

    await userEvent.type(screen.getByLabelText(/Envelope Name/i), 'Food');
    await userEvent.click(screen.getByLabelText(/Category/i));
    await userEvent.click(await screen.findByRole('option', { name: 'Groceries' }));
    await userEvent.type(screen.getByLabelText(/Budgeted Amount/i), '10');

    await userEvent.click(screen.getByRole('button', { name: /Create Envelope/i }));

    expect(await screen.findByText(/Failed to create envelope/i)).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
