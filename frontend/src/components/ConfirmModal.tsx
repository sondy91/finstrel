import React from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title = 'Confirm Action', // Default title
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h4>{title}</h4>
        <p>{message}</p>
        <div className="modal-actions">
          <button onClick={onCancel} className="btn btn-secondary">{cancelText}</button>
          <button onClick={onConfirm} className="btn btn-danger">{confirmText}</button> {/* Using btn-danger for confirm, typically destructive */}
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
