import { FileText, Image } from 'lucide-react';
import { ToolCard } from './ToolCard';
import { useWorkingDir } from '../../../contexts/WorkingDirContext';
import { toRelativePath } from '../../../utils/paths';

interface ReadToolUseProps {
  input: {
    file_path?: string;
    offset?: number;
    limit?: number;
  };
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

function isImageFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().split('.').pop();
  return ext ? IMAGE_EXTENSIONS.includes(`.${ext}`) : false;
}

export function ReadToolUse({ input }: ReadToolUseProps) {
  const workingDir = useWorkingDir();
  const filePath = input.file_path || '';
  const displayPath = toRelativePath(filePath, workingDir);
  const isImage = isImageFile(filePath);

  // Build image URL for any image file
  const imageUrl = isImage
    ? `/api/files/raw?path=${encodeURIComponent(filePath)}`
    : null;

  return (
    <ToolCard
      icon={isImage ? Image : FileText}
      color="green"
      title={<>Reading: {displayPath || 'file'}</>}
    >
      {(input.offset || input.limit) && (
        <div className="mt-1 text-xs text-green-600 dark:text-green-400">
          {input.offset && `Lines ${input.offset}-${(input.offset || 0) + (input.limit || 0)}`}
        </div>
      )}
      {imageUrl && (
        <div className="mt-2 overflow-hidden rounded-md border border-green-200 bg-white dark:border-green-700 dark:bg-gray-900">
          <img
            src={imageUrl}
            alt={filePath}
            className="max-h-96 w-full object-contain"
            loading="lazy"
          />
        </div>
      )}
    </ToolCard>
  );
}
