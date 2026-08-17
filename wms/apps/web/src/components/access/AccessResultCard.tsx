import { CheckCircle2 } from 'lucide-react';

type AccessResultCardProps = {
  title: string;
  lines: string[];
};

export function AccessResultCard({ title, lines }: AccessResultCardProps) {
  return (
    <div className="access-result">
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
