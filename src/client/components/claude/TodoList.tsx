import { ChevronDown, ChevronRight, ListTodo, Circle, CheckCircle2, Clock } from 'lucide-react';
import { useState } from 'react';

export interface TodoItem {
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface TodoListProps {
  todos: TodoItem[];
}

export function TodoList({ todos }: TodoListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (todos.length === 0) {
    return null;
  }

  const inProgressCount = todos.filter(t => t.status === 'in_progress').length;
  const completedCount = todos.filter(t => t.status === 'completed').length;

  return (
    <div className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-750"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-500" />
          )}
          <ListTodo className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Task Progress
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {completedCount}/{todos.length} completed
          </span>
        </div>
        {inProgressCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
            <Circle className="h-3 w-3 animate-pulse fill-current" />
            <span>In progress</span>
          </div>
        )}
      </button>

      {isExpanded && (
        <div className="space-y-1 px-4 pb-3">
          {todos.map((todo, idx) => {
            let Icon = Circle;
            if (todo.status === 'completed') {
              Icon = CheckCircle2;
            } else if (todo.status === 'in_progress') {
              Icon = Clock;
            }

            let iconColor = 'text-gray-400 dark:text-gray-500';
            if (todo.status === 'completed') {
              iconColor = 'text-green-600 dark:text-green-400';
            } else if (todo.status === 'in_progress') {
              iconColor = 'text-blue-600 dark:text-blue-400';
            }

            const textColor = todo.status === 'completed'
              ? 'text-gray-500 dark:text-gray-400 line-through'
              : 'text-gray-700 dark:text-gray-300';

            return (
              <div key={idx} className="flex items-start gap-2 py-1">
                <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${iconColor} ${todo.status === 'in_progress' ? 'animate-pulse' : ''}`} />
                <span className={`text-sm ${textColor}`}>
                  {todo.status === 'in_progress' ? todo.activeForm : todo.content}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
