import { t, useI18n } from "@/lib/i18n";
import { Button } from "@/components";

interface DeleteConfirmationDialogProps {
  deleteConfirm: string | null;
  cancelDelete: () => void;
  confirmDelete: () => void;
}

export const DeleteConfirmationDialog = ({
  deleteConfirm,
  cancelDelete,
  confirmDelete,
}: DeleteConfirmationDialogProps) => {
  useI18n();
  if (!deleteConfirm) return null;

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border rounded-lg p-6 max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-2">{t("Delete Conversation")}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t("Are you sure you want to delete this conversation? This action cannot be undone.")}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={cancelDelete}>
            {t("Cancel")}</Button>
          <Button variant="destructive" onClick={confirmDelete}>
            {t("Delete")}</Button>
        </div>
      </div>
    </div>
  );
};
