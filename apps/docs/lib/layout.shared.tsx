import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { LogoShapesWave } from '@/components/logo';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <LogoShapesWave />,
    },
  };
}
