import { CheckCircle2 } from 'lucide-react';

type DirectoryResultCardProps = {
  title: string;
  lines: string[];
};

export function DirectoryResultCard({ title, lines }: DirectoryResultCardProps) {
  return (
    <div className="directory-result">
      <CheckCircle2 size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
    </div>
  );
}
