import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from '@mui/material';
import React, { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { CreateEnvelope } from '../wailsAdapter';

interface Category {
  id: number;
  name: string;
  type: string;
}

interface EnvelopeFormProps {
  open: boolean;
  onClose: () => void;
  onEnvelopeCreated: () => void;
  categories: Category[];
}

const EnvelopeForm: React.FC<EnvelopeFormProps> = ({ open, onClose, onEnvelopeCreated, categories }) => {
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      // Reset form when opened
      setName('');
      setCategoryId('');
      setAmount('');
      setError('');
    }
  }, [open]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!name || !categoryId || !amount) {
      setError('Please fill in all fields');
      return;
    }

    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await CreateEnvelope({
        name,
        category_id: categoryId,
        amount: amountValue
      });

      onEnvelopeCreated();
      onClose();
    } catch (err) {
      console.error('Error creating envelope:', err);
      setError('Failed to create envelope. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Envelope</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          {error && (
            <Box color="error.main" mb={2}>
              {error}
            </Box>
          )}

          <TextField
            autoFocus
            margin="dense"
            label="Envelope Name"
            type="text"
            fullWidth
            variant="outlined"
            value={name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            disabled={isLoading}
            sx={{ mb: 2 }}
          />

          <TextField
            select
            margin="dense"
            label="Category"
            fullWidth
            variant="outlined"
            value={categoryId}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setCategoryId(Number(e.target.value))}
            disabled={isLoading}
            sx={{ mb: 2 }}
          >
            <MenuItem value="">
              <em>Select a category</em>
            </MenuItem>
            {categories.map((category) => (
              <MenuItem key={category.id} value={category.id}>
                {category.name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            margin="dense"
            label="Budgeted Amount"
            type="number"
            fullWidth
            variant="outlined"
            value={amount}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
            disabled={isLoading}
            inputProps={{ min: 0.01, step: 0.01 }}
            InputProps={{
              startAdornment: '$',
            }}
          />
        </DialogContent>

        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={isLoading}
          >
            {isLoading ? 'Creating...' : 'Create Envelope'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default EnvelopeForm;
