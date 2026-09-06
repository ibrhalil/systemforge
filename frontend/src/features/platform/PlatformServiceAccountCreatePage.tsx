import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuKeyRound } from 'react-icons/lu';
import { Page } from '../../components/Page';
import { DetailPanel } from '../../components/detail/DetailPanel';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { SelectInput } from '../../components/ui/SelectInput';
import { PLATFORM_PERMISSIONS } from '../../lib/permissions';
import { useT } from '../../lib/i18n';
import { notify, extractFieldErrors } from '../../lib/notify';
import type { SelectOption } from '../../lib/select';
import { useCreateServiceAccount } from './hooks';
import { RawKeyModal } from './RawKeyModal';

const SCOPE_OPTIONS: SelectOption<string>[] = Object.values(PLATFORM_PERMISSIONS).map((s) => ({
  value: s,
  label: s,
}));

/**
 * Service account create page (/platform/service-accounts/new) — the K-58 CRUD
 * surface rule: entity create is a page. The one-time raw key reveal stays in a
 * modal (helper exception) and gates the return navigation.
 */
export function PlatformServiceAccountCreatePage() {
  const { t } = useT();
  const navigate = useNavigate();
  const create = useCreateServiceAccount();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<SelectOption<string>[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [rawKey, setRawKey] = useState<string | null>(null);

  const submit = async () => {
    setFieldErrors({});
    try {
      const created = await create.mutateAsync({
        name: name.trim(),
        scopes: scopes.map((s) => s.value),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      notify.success(t('platform.svc.created'));
      // The raw key is shown exactly once — the reveal modal gates going back.
      setRawKey(created.rawKey);
    } catch (e) {
      const errors = extractFieldErrors(e);
      if (Object.keys(errors).length) setFieldErrors(errors);
    }
  };

  return (
    <Page
      breadcrumb={[
        { label: t('platform.console') },
        { label: t('platform.nav.serviceAccounts'), to: '/platform/service-accounts' },
        { label: t('platform.svc.createTitle') },
      ]}
      title={t('platform.svc.createTitle')}
      description={t('platform.svc.desc')}
    >
      <DetailPanel title={t('common.details')}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
          noValidate
        >
          <TextField
            id="svc-name"
            label={t('platform.svc.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={fieldErrors.name ?? null}
            required
          />
          <SelectInput
            label={t('platform.svc.scopes')}
            options={SCOPE_OPTIONS}
            value={scopes}
            onChange={(v) => setScopes((v as SelectOption<string>[]) ?? [])}
            isMulti
            placeholder={t('common.typeToSearch')}
            error={fieldErrors.scopes ?? null}
          />
          <TextField
            id="svc-expires"
            label={t('platform.svc.expiresAt')}
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            hint={t('platform.svc.expiresHint')}
            error={fieldErrors.expiresAt ?? null}
          />
        </form>
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => navigate('/platform/service-accounts')} disabled={create.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={create.isPending}
            disabled={!name.trim() || scopes.length === 0}
          >
            <LuKeyRound aria-hidden className="h-4 w-4" />
            {t('common.create')}
          </Button>
        </div>
      </DetailPanel>

      <RawKeyModal rawKey={rawKey} onClose={() => { setRawKey(null); navigate('/platform/service-accounts'); }} />
    </Page>
  );
}
