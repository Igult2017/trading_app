interface ToastProps {
  message: string;
}

/** Bottom-centre transient message. Sits above the mobile nav on small screens. */
export function Toast({ message }: ToastProps) {
  return (
    <div className="ct-toast fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-5 py-3 rounded-lg font-body-md text-[11px] shadow-lg z-50">
      {message}
    </div>
  );
}
