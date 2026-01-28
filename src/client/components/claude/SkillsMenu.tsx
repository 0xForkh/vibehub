import { Wand2, Container, ChevronDown, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';

interface Skill {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

interface SkillsMenuProps {
  workingDir?: string;
  disabled?: boolean;
  onRunSkill: (prompt: string) => void;
}

// Map skill icon names to Lucide components
const iconMap: Record<string, typeof Container> = {
  Container,
  Wand2,
};

export function SkillsMenu({ workingDir, disabled, onRunSkill }: SkillsMenuProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [runningSkill, setRunningSkill] = useState<string | null>(null);

  // Fetch available skills
  useEffect(() => {
    async function fetchSkills() {
      try {
        const response = await fetch('/api/skills');
        if (response.ok) {
          const data = await response.json();
          setSkills(data.skills || []);
        }
      } catch (err) {
        console.error('Failed to fetch skills:', err);
      }
    }
    fetchSkills();
  }, []);

  const handleRunSkill = useCallback(async (skillId: string) => {
    if (!workingDir || runningSkill) return;

    setRunningSkill(skillId);
    setIsOpen(false);

    try {
      const response = await fetch(`/api/skills/${skillId}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workingDir }),
      });

      if (response.ok) {
        const data = await response.json();
        onRunSkill(data.prompt);
      } else {
        console.error('Failed to get skill prompt');
      }
    } catch (err) {
      console.error('Failed to run skill:', err);
    } finally {
      setRunningSkill(null);
    }
  }, [workingDir, runningSkill, onRunSkill]);

  if (skills.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(prev => !prev)}
        disabled={disabled || !workingDir}
        className={`flex h-7 items-center gap-1 px-1.5 sm:h-8 sm:gap-1.5 sm:px-2 ${isOpen ? 'bg-gray-200 dark:bg-gray-600' : ''}`}
        title="Run a skill"
      >
        {runningSkill ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" />
        ) : (
          <Wand2 className="h-3.5 w-3.5 text-purple-500 sm:h-4 sm:w-4" />
        )}
        <span className="hidden text-xs md:inline">Skills</span>
        <ChevronDown className="hidden h-3 w-3 text-gray-400 md:block" />
      </Button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[240px] rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-700">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Available Skills
              </div>
            </div>
            {skills.map((skill) => {
              const IconComponent = skill.icon && iconMap[skill.icon] ? iconMap[skill.icon] : Wand2;
              const isRunning = runningSkill === skill.id;

              return (
                <button
                  key={skill.id}
                  onClick={() => handleRunSkill(skill.id)}
                  disabled={isRunning || !workingDir}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-700"
                >
                  {isRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                  ) : (
                    <IconComponent className="h-4 w-4 text-purple-500" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {skill.name}
                    </div>
                    <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {skill.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
