import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import AddCategoryForm from './AddCategoryForm';
import { AddCategoryWithDefault } from '@/wailsAdapter';

vi.mock('@/wailsAdapter', () => ({
  AddCategoryWithDefault: vi.fn(),
  GetCategories: vi.fn(),
  UpdateCategory: vi.fn(),
}));
it('shows a clear duplicate error returned by the native bridge', async () => {
  vi.mocked(AddCategoryWithDefault).mockRejectedValue('a category with that name already exists');
  const user = userEvent.setup();
  render(<AddCategoryForm categories={[]} onCategoryAdded={vi.fn()} />);
  await user.type(screen.getByLabelText(/category name/i), 'Food');
  await user.click(screen.getByRole('button', { name: 'Add Category' }));
  expect(await screen.findByText('a category with that name already exists')).toBeInTheDocument();
});
