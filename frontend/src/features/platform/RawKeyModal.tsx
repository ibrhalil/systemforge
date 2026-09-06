import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useT } from '../../lib/i18n';

/**
 * One-time raw API key reveal (K-58 helper-modal exception): the key is shown
 * exactly once after creation — the list never carries it.
 */
export function RawKeyModal({ rawKey, onClose }: { rawKey: string | null; onClose: () => void }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  return (
    <Modal
      open={!!rawKey}
      title={t('platform.svc.rawKeyTitle')}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard?.writeText(rawKey ?? '');
              setCopied(true);
            }}
          >
            {copied ? t('platform.svc.copied') : t('platform.svc.copy')}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-sm text-muted">{t('platform.svc.rawKeyDesc')}</p>
        <code className="block break-all rounded-lg border border-glass bg-main/5 p-3 font-mono text-sm text-main">
          {rawKey}
        </code>
      </div>
    </Modal>
  );
}
