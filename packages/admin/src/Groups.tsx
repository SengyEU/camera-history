import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, type AdminCamera, type AdminGroup } from "./api";
import { EmbedCodePanel } from "./EmbedCodePanel";
import { PageHeader } from "./PageHeader";
import { embedSnippet, groupEmbedId, groupEmbedSrc } from "./embed";
import { SLUG_RE, slugify } from "./slug";

export interface GroupInput {
  name: string;
  slug: string;
  cameraIds: string[];
}

function cameraLabel(cameras: AdminCamera[], id: string): string {
  return cameras.find((camera) => camera.id === id)?.name ?? "Unknown camera";
}

export function GroupsView({
  groups,
  cameras,
  loading,
  onNew,
  onEdit,
  onGroupsChange,
}: {
  groups: AdminGroup[];
  cameras: AdminCamera[];
  loading: boolean;
  onNew: () => void;
  onEdit: (group: AdminGroup) => void;
  onGroupsChange: () => void | Promise<unknown>;
}) {
  const [deleting, setDeleting] = useState<AdminGroup | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    setError(null);
    try {
      await api.deleteGroup(target.id);
      await onGroupsChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <>
      <PageHeader
        title="Groups"
        description="Bundle cameras into one widget with a switcher your visitors can use."
      >
        <button onClick={onNew} data-testid="add-group">
          + New group
        </button>
      </PageHeader>
      <section className="panel" data-testid="groups-view">
        {error && (
          <p className="error" data-testid="group-error">
            {error}
          </p>
        )}
        {groups.length === 0 ? (
          loading ? (
            <p className="loading">Loading…</p>
          ) : (
            <div className="empty-state" data-testid="groups-empty">
              <p className="empty-title">No groups yet</p>
              <p>Group cameras into one embeddable widget with a switcher.</p>
              <button onClick={onNew} data-testid="empty-add-group">
                Create your first group
              </button>
            </div>
          )
        ) : (
          <ul className="group-list">
            {groups.map((group) => (
              <li key={group.id} className="group-card" data-testid={`group-${group.id}`}>
                <div className="group-head">
                  <div className="group-meta">
                    <strong>{group.name}</strong>
                    <span className="group-slug">{group.slug}</span>
                    <span className="group-count" data-testid={`group-count-${group.id}`}>
                      {group.cameraIds.length === 1
                        ? "1 camera"
                        : `${group.cameraIds.length} cameras`}
                    </span>
                  </div>
                  <div className="cell-actions">
                    <button
                      className="secondary"
                      onClick={() => onEdit(group)}
                      data-testid={`group-edit-${group.id}`}
                    >
                      Edit
                    </button>
                    <button
                      className="danger"
                      onClick={() => setDeleting(group)}
                      data-testid={`group-delete-${group.id}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="group-camera-chips" data-testid={`group-cameras-${group.id}`}>
                  {group.cameraIds.length === 0 ? (
                    <span className="field-hint">No cameras yet.</span>
                  ) : (
                    group.cameraIds.map((id, index) => (
                      <span className="camera-chip" key={id}>
                        <span className="camera-chip-index">{index + 1}</span>
                        {cameraLabel(cameras, id)}
                      </span>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {deleting !== null && (
          <div className="modal">
            <div className="modal-body">
              <p>
                Delete group &quot;{deleting.name}&quot;? Cameras stay — only the group goes away.
              </p>
              <div className="form-actions">
                <button className="danger" onClick={() => void remove()} data-testid="confirm-delete-group">
                  Delete
                </button>
                <button className="secondary" onClick={() => setDeleting(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function SortableCameraRow({
  camera,
  onRemove,
}: {
  camera: AdminCamera;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: camera.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="sortable-camera"
      data-testid={`group-camera-${camera.id}`}
    >
      <button
        type="button"
        className="drag-handle"
        aria-label={`Reorder ${camera.name}`}
        data-testid={`group-camera-drag-${camera.id}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span className="sortable-camera-name">{camera.name}</span>
      <button
        type="button"
        className="link"
        onClick={onRemove}
        data-testid={`group-camera-remove-${camera.id}`}
      >
        Remove
      </button>
    </div>
  );
}

export function GroupEditor({
  group,
  cameras,
  tenantSlug,
  onSave,
  onCancel,
  onOrderSaved,
}: {
  group: AdminGroup | null;
  cameras: AdminCamera[];
  tenantSlug: string;
  onSave: (input: GroupInput) => Promise<void>;
  onCancel: () => void;
  onOrderSaved?: () => void | Promise<unknown>;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [slug, setSlug] = useState(group?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(group));
  const [cameraIds, setCameraIds] = useState<string[]>(group?.cameraIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; slug?: string }>({});
  const initialSnapshot = useRef({
    name: group?.name ?? "",
    slug: group?.slug ?? "",
    cameraIds: [...(group?.cameraIds ?? [])],
  });
  const [orderSaveState, setOrderSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [previewVersion, setPreviewVersion] = useState(0);

  const selected = useMemo(
    () =>
      cameraIds
        .map((id) => cameras.find((camera) => camera.id === id))
        .filter((camera): camera is AdminCamera => Boolean(camera)),
    [cameraIds, cameras],
  );
  const available = cameras.filter((camera) => !cameraIds.includes(camera.id));

  const dirty = useMemo(() => {
    const initialValues = initialSnapshot.current;
    const sameMembers = (() => {
      if (cameraIds.length !== initialValues.cameraIds.length) return false;
      const current = [...cameraIds].sort();
      const initial = [...initialValues.cameraIds].sort();
      return current.every((id, index) => id === initial[index]);
    })();
    const sameOrder =
      cameraIds.length === initialValues.cameraIds.length &&
      cameraIds.every((id, index) => id === initialValues.cameraIds[index]);
    return (
      name !== initialValues.name ||
      slug !== initialValues.slug ||
      !sameMembers ||
      (!group && !sameOrder)
    );
  }, [name, slug, cameraIds, group]);

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const requestCancel = () => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onCancel();
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = cameraIds.indexOf(String(active.id));
    const to = cameraIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(cameraIds, from, to);
    const previous = cameraIds;
    setCameraIds(next);
    if (!group) return;
    setOrderSaveState("saving");
    void api
      .setGroupCameras(group.id, next)
      .then(async () => {
        setOrderSaveState("saved");
        setPreviewVersion((version) => version + 1);
        await onOrderSaved?.();
      })
      .catch((err: unknown) => {
        setOrderSaveState("error");
        setError(err instanceof Error ? err.message : "Saving camera order failed");
        setCameraIds(previous);
      });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const nextErrors: typeof fieldErrors = {};
    if (!name.trim()) {
      nextErrors.name = "Name is required.";
    }
    if (!SLUG_RE.test(slug)) {
      nextErrors.slug = "Slug can only contain lowercase letters, numbers and hyphens.";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      window.setTimeout(() => {
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      }, 0);
      return;
    }
    try {
      await onSave({ name: name.trim(), slug, cameraIds });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const embedCode =
    group && tenantSlug
      ? embedSnippet(
          groupEmbedSrc(tenantSlug, group.slug),
          groupEmbedId(tenantSlug, group.slug),
          `${name || group.name} — Camera History`,
        )
      : "";
  const embedId = group && tenantSlug ? groupEmbedId(tenantSlug, group.slug) : "";

  return (
    <section className="panel camera-editor group-editor" data-testid="group-editor">
      <header className="editor-head">
        <button
          type="button"
          className="link editor-back"
          onClick={requestCancel}
          data-testid="group-back"
        >
          ← Back to groups
        </button>
        <div className="editor-head-row">
          <div>
            <p className="page-kicker">Groups</p>
            <h1>{group ? "Edit group" : "New group"}</h1>
          </div>
          <span className={`editor-save-state${dirty ? " is-dirty" : ""}`}>
            {dirty ? "Unsaved changes" : group ? "Saved" : "Not saved yet"}
          </span>
        </div>
      </header>
      <div className="camera-editor-body">
        <form className="camera-form" onSubmit={submit} data-testid="group-form" noValidate>
          {error && (
            <p className="error" data-testid="group-form-error">
              {error}
            </p>
          )}

          <section className="form-section">
            <h4>Basics</h4>
            <label>
              Name
              <input
                value={name}
                onChange={(event) => {
                  const next = event.target.value;
                  setName(next);
                  setFieldErrors((current) => ({ ...current, name: undefined }));
                  if (!slugTouched) setSlug(slugify(next));
                }}
                data-testid="group-name"
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "group-name-error" : undefined}
                required
              />
              {fieldErrors.name && (
                <span className="field-error" id="group-name-error">
                  {fieldErrors.name}
                </span>
              )}
            </label>
            <label>
              Slug
              <input
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                  setFieldErrors((current) => ({ ...current, slug: undefined }));
                }}
                data-testid="group-slug"
                aria-invalid={Boolean(fieldErrors.slug)}
                aria-describedby={fieldErrors.slug ? "group-slug-error" : undefined}
                required
              />
              {fieldErrors.slug && (
                <span className="field-error" id="group-slug-error">
                  {fieldErrors.slug}
                </span>
              )}
              <span className="field-hint">
                Used in the group embed URL. Changes apply after saving.
              </span>
            </label>
          </section>

          <section className="form-section">
            <h4>Cameras</h4>
            <span className="field-hint">
              Drag the handle to change the camera order. Order saves automatically.
            </span>
            {selected.length === 0 ? (
              <p className="empty">No cameras yet. Add one below.</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={cameraIds} strategy={verticalListSortingStrategy}>
                  <div className="sortable-camera-list">
                    {selected.map((camera) => (
                      <SortableCameraRow
                        key={camera.id}
                        camera={camera}
                        onRemove={() =>
                          setCameraIds((ids) => ids.filter((id) => id !== camera.id))
                        }
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            {group && orderSaveState !== "idle" && (
              <span className="field-hint" data-testid="group-order-save-state">
                {orderSaveState === "saving"
                  ? "Saving order…"
                  : orderSaveState === "saved"
                    ? "Order saved"
                    : "Order save failed"}
              </span>
            )}
          </section>

          <section className="form-section">
            <h4>Add cameras</h4>
            {available.length === 0 ? (
              <p className="field-hint">All cameras are in this group.</p>
            ) : (
              <div className="available-camera-list">
                {available.map((camera) => (
                  <div className="available-camera" key={camera.id}>
                    <span>{camera.name}</span>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setCameraIds((ids) => [...ids, camera.id])}
                      data-testid={`group-camera-add-${camera.id}`}
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="form-actions editor-actions">
            <button type="submit" data-testid="group-save">
              Save
            </button>
            <button
              type="button"
              className="secondary"
              onClick={requestCancel}
              data-testid="group-cancel"
            >
              Cancel
            </button>
          </div>
        </form>
        <aside className="camera-preview">
          <div className="panel-head">
            <h3>Live preview</h3>
            <span className="ts-chip">PREVIEW</span>
          </div>
          {group && tenantSlug ? (
            <iframe
              key={`${group.id}-${previewVersion}`}
              data-testid="group-preview"
              src={`${groupEmbedSrc(tenantSlug, group.slug)}?noembed=1`}
              title={`${group.name} preview`}
              loading="lazy"
              data-camera-history-preview="1"
              style={{ width: "100%", height: 520, border: 0, borderRadius: 8 }}
            />
          ) : (
            <p className="field-hint">Save the group to see its live preview.</p>
          )}
          <p className="field-hint" data-testid="group-preview-hint">
            If today has no captures, the preview shows the latest available day.
          </p>
          <p className="field-hint">
            Reordering cameras saves automatically. Other changes apply after saving.
          </p>
          {group && tenantSlug ? (
            <EmbedCodePanel
              code={embedCode}
              id={embedId}
              hint="Share your page URL with"
              suffix="to scroll straight to this group."
              testId="group-embed-code"
            />
          ) : (
            <p className="field-hint">Save the group to get its embed code.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
