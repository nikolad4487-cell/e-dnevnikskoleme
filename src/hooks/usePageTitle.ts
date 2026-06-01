import { useEffect } from 'react';

export const usePageTitle = (title: string | null | undefined) => {
  useEffect(() => {
    document.title = title ? `e-Dnevnik - ${title}` : "e-Dnevnik";
  }, [title]);
};
