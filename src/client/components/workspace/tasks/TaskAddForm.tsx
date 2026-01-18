import { useState } from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';

interface TaskAddFormProps {
  onSubmit: (title: string, description?: string) => Promise<void>;
  onCancel: () => void;
}

export function TaskAddForm({ onSubmit, onCancel }: TaskAddFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async () => {
    if (!title.trim()) return;
    await onSubmit(title.trim(), description.trim() || undefined);
    setTitle('');
    setDescription('');
  };

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title..."
        className="mb-2"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && !e.shiftKey && title.trim()) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <textarea
        value={description}
        onChange={(e) => {
          setDescription(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        placeholder="Description (optional)..."
        className="mb-3 w-full resize-none rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
        rows={2}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit}>
          Add Task
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
