import lightLogo from '@/assets/images/falcon-glide/falcon-glide-original-light.png';
import darkLogo from '@/assets/images/falcon-glide/falcon-glide-original-dark.png';

export default function BrandMark({ className = '' }: { className?: string }) {
  return <span className={`inline-flex shrink-0 items-center justify-center ${className}`} aria-hidden="true">
    <img src={lightLogo} alt="" className="h-full w-full object-contain dark:hidden" />
    <img src={darkLogo} alt="" className="hidden h-full w-full object-contain dark:block" />
  </span>;
}
