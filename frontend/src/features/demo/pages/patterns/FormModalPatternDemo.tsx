import { useState } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { TextField } from '../../../../components/ui/Field';
import { DemoSection } from '../../components/DemoSection';
import { LuKeyRound, LuCheck } from 'react-icons/lu';

function LiveQuickActionModal() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setError(null);
    setLoading(true);
    // Simulate server mutation
    setTimeout(() => {
      setLoading(false);
      setOpen(false);
      setPassword('');
      setDone(true);
    }, 900);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="primary" onClick={() => { setDone(false); setOpen(true); }}>
          <LuKeyRound className="h-4 w-4" />
          <span>Reset Password</span>
        </Button>
      </div>

      {done && (
        <div className="rounded-lg border border-accent-green/30 bg-accent-green/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-accent-green">
            <LuCheck className="h-4 w-4" />
            <span>Password reset email dispatched!</span>
          </div>
        </div>
      )}

      <Modal
        open={open}
        title="Reset Password"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit} loading={loading}>
              Send Reset
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="New Password"
            type="password"
            placeholder="Minimum 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
            hint="A one-time setup link can also be emailed instead."
          />
        </div>
      </Modal>
    </div>
  );
}

const QUICK_ACTION_MODAL_CODE = `import { Modal } from 'components/ui/Modal';
import { Button } from 'components/ui/Button';
import { TextField } from 'components/ui/Field';

// Quick helper actions (reset password, assign roles, status change, one-time
// secret reveal) are the ONLY forms that live in modals. Entity create/edit
// always navigates to a page (CRUD surface rule).
export function ResetPasswordModal({ open, userId, onClose }: Props) {
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const reset = useResetPassword(); // mutations.onError -> global toast

  const handleSubmit = async () => {
    try {
      await reset.mutateAsync({ userId, password });
      onClose();
    } catch (err) {
      setFieldErrors(extractFieldErrors(err)); // inline field errors
    }
  };

  return (
    <Modal
      open={open}
      title="Reset Password"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={reset.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={reset.isPending}>
            Send Reset
          </Button>
        </>
      }
    >
      <TextField
        label="New Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password ?? null}
      />
    </Modal>
  );
}`;

export function FormModalPatternDemo() {
  return (
    <div className="space-y-10">
      <div>
        <div className="inline-flex items-center gap-1.5 rounded-md bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent mb-2">
          Form Pattern
        </div>
        <h1 className="text-2xl font-bold text-main">Quick Action Modal Pattern</h1>
        <p className="mt-1 text-sm text-muted">
          Modals are reserved for single-purpose quick helper actions (reset password, assign roles,
          status/plan change, one-time secret reveal) and destructive ConfirmDialogs.
          Entity create/edit NEVER uses a modal — it navigates to a page (see the Entity Detail Page pattern).
          Keep the form small: one focused action, loading state on the primary button, field errors inline.
        </p>
      </div>

      <DemoSection
        title="Live Interactive Quick Action"
        description="Try triggering validation (short password), submitting, and observing the loading state — the modal stays open on error."
        code={QUICK_ACTION_MODAL_CODE}
      >
        <LiveQuickActionModal />
      </DemoSection>
    </div>
  );
}
