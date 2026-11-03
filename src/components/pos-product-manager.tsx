"use client";

import { type ChangeEvent, type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type ProductType = "ENTRY" | "TABLE" | "BAR";
type Product = {
  id: string;
  name: string;
  description: string | null;
  type: ProductType;
  basePrice: string;
  active: boolean;
  imagePath: string | null;
  imageUrl: string | null;
  hasHistory: boolean;
  hasEventPrices: boolean;
};
const types: Array<{ value: ProductType; label: string }> = [
  { value: "ENTRY", label: "Entrada" },
  { value: "TABLE", label: "Mesa" },
  { value: "BAR", label: "Produto do bar" },
];
const typeLabels: Record<ProductType, string> = { ENTRY: "Entrada", TABLE: "Mesa", BAR: "Bar" };
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
type Draft = { name: string; description: string; type: ProductType; cents: string; file: File | null; removeImage: boolean };

function asCents(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? digits.padStart(3, "0") : "";
}
function displayCents(cents: string) {
  if (!cents) return "";
  const normalized = cents.padStart(3, "0");
  return currency.format(Number(normalized.slice(0, -2) + "." + normalized.slice(-2)));
}
function decimalCents(cents: string) {
  const normalized = cents.padStart(3, "0");
  return `${normalized.slice(0, -2)}.${normalized.slice(-2)}`;
}

export function PosProductManager({ products }: { products: Product[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>({ name: "", description: "", type: "ENTRY", cents: "", file: null, removeImage: false });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState("");
  const [message, setMessage] = useState("");

  function openNew() {
    setEditing(null);
    setDraft({ name: "", description: "", type: "ENTRY", cents: "", file: null, removeImage: false });
    setFormMessage("");
    setMessage("");
    setCreating(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setDraft({ name: product.name, description: product.description || "", type: product.type, cents: asCents(product.basePrice), file: null, removeImage: false });
    setFormMessage("");
    setMessage("");
    setCreating(false);
  }

  function closeDialog() {
    if (saving) return;
    setCreating(false);
    setEditing(null);
    setFormMessage("");
  }

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function onPriceChange(event: ChangeEvent<HTMLInputElement>) {
    updateDraft("cents", asCents(event.currentTarget.value));
  }

  async function uploadImage(productId: string, file: File) {
    const form = new FormData();
    form.set("file", file);
    const response = await fetch(`/api/pos/products/${productId}/image`, { method: "POST", body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Produto salvo, mas não foi possível enviar a imagem.");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.cents || Number(draft.cents) < 1) {
      setFormMessage("Informe um preço maior que R$ 0,00.");
      return;
    }
    setSaving(true);
    setFormMessage("");
    try {
      const response = await fetch(editing ? `/api/pos/products/${editing.id}` : "/api/pos/products", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: draft.name, description: draft.description, type: draft.type, basePrice: decimalCents(draft.cents) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar o produto.");
      const productId = editing?.id || result.id;
      let imageWarning = "";
      try {
        if (draft.file) await uploadImage(productId, draft.file);
        else if (editing && draft.removeImage) {
          const imageResponse = await fetch(`/api/pos/products/${productId}/image`, { method: "DELETE" });
          const imageResult = await imageResponse.json().catch(() => ({}));
          if (!imageResponse.ok) throw new Error(imageResult.error || "Não foi possível remover a imagem.");
        }
      } catch (error) {
        imageWarning = error instanceof Error ? error.message : "Não foi possível atualizar a imagem.";
      }
      setCreating(false);
      setEditing(null);
      setFormMessage("");
      setMessage(imageWarning ? `Produto salvo. ${imageWarning} Você pode tentar novamente editando o produto.` : editing ? "Produto atualizado." : "Produto cadastrado.");
      router.refresh();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Não foi possível salvar o produto.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product: Product) {
    setBusyId(product.id);
    setMessage("");
    try {
      const response = await fetch(`/api/pos/products/${product.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: !product.active }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível alterar o status.");
      setMessage(product.active ? "Produto inativado." : "Produto reativado.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível alterar o status.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteProduct(product: Product) {
    if (product.hasHistory || product.hasEventPrices || !window.confirm(`Excluir o produto “${product.name}”? Esta ação não pode ser desfeita.`)) return;
    setBusyId(product.id);
    setMessage("");
    try {
      const response = await fetch(`/api/pos/products/${product.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir o produto.");
      setMessage("Produto excluído.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir o produto.");
    } finally {
      setBusyId(null);
    }
  }

  return <section className="section pos-product-manager">
    <div className="register-toolbar">
      <div>
        <h2>Catálogo</h2>
        <p className="muted">Entradas, mesas e itens de bar. As imagens serão exibidas nos terminais do PDV.</p>
      </div>
      <button className="button" type="button" onClick={openNew}>Novo produto</button>
    </div>
    {message && <p className="form-message register-message" role="status">{message}</p>}
    {products.length ? <div className="register-table-wrap">
      <table className="register-table">
        <thead><tr><th>Imagem</th><th>Produto</th><th>Tipo</th><th>Preço padrão</th><th>Situação</th><th>Ações</th></tr></thead>
        <tbody>{products.map((product) => {
          const busy = busyId === product.id;
          return <tr key={product.id}>
            <td><div className="pos-product-thumbnail" role={product.imageUrl ? "img" : undefined} aria-label={product.imageUrl ? `Imagem de ${product.name}` : undefined} style={product.imageUrl ? { backgroundImage: `url(${JSON.stringify(product.imageUrl)})` } : undefined}>{!product.imageUrl && <span>Sem imagem</span>}</div></td>
            <td><strong>{product.name}</strong>{product.description && <div className="muted">{product.description}</div>}</td>
            <td>{typeLabels[product.type]}</td>
            <td>{currency.format(Number(product.basePrice))}</td>
            <td><span className={product.active ? "tag" : "tag tag-neutral"}>{product.active ? "ATIVO" : "INATIVO"}</span></td>
            <td><div className="register-actions">
              <button className="button button-secondary button-small" type="button" disabled={busy} onClick={() => openEdit(product)}>Editar</button>
              <button className="button button-secondary button-small" type="button" disabled={busy} onClick={() => toggleActive(product)}>{busy ? "Aguarde…" : product.active ? "Inativar" : "Reativar"}</button>
              <button className="button button-danger button-small" type="button" disabled={busy || product.hasHistory || product.hasEventPrices} title={product.hasHistory || product.hasEventPrices ? "Produtos com pedidos ou preço de evento devem ser inativados." : "Excluir produto"} onClick={() => deleteProduct(product)}>Excluir</button>
            </div></td>
          </tr>;
        })}</tbody>
      </table>
    </div> : <div className="card empty">Nenhum produto cadastrado.</div>}

    {(creating || editing) && <div className="register-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <section className="card register-modal" role="dialog" aria-modal="true" aria-labelledby="pos-product-modal-title" onKeyDown={(event) => { if (event.key === "Escape") closeDialog(); }}>
        <div className="register-modal-header">
          <h2 id="pos-product-modal-title">{editing ? "Editar produto" : "Novo produto"}</h2>
          <button className="register-modal-close" type="button" aria-label="Fechar" disabled={saving} onClick={closeDialog}>×</button>
        </div>
        <form className="register-modal-form" onSubmit={save}>
          <label>Nome<input name="name" required minLength={2} maxLength={120} value={draft.name} onChange={(event) => updateDraft("name", event.currentTarget.value)} autoFocus /></label>
          <label>Categoria<select name="type" required value={draft.type} onChange={(event) => updateDraft("type", event.currentTarget.value as ProductType)}>{types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
          <label>Descrição<input name="description" maxLength={240} value={draft.description} onChange={(event) => updateDraft("description", event.currentTarget.value)} /></label>
          <label>Preço padrão<input name="basePrice" type="text" inputMode="decimal" autoComplete="off" placeholder="R$ 0,00" value={displayCents(draft.cents)} onChange={onPriceChange} required /></label>
          <label>Imagem para o PDV<input name="image" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { updateDraft("file", event.currentTarget.files?.[0] || null); updateDraft("removeImage", false); }} />{editing?.imagePath && !draft.removeImage && <span className="muted">Imagem atual cadastrada.</span>}</label>
          {editing?.imagePath && <label className="pos-remove-image"><input type="checkbox" checked={draft.removeImage} onChange={(event) => updateDraft("removeImage", event.currentTarget.checked)} /> Remover imagem atual</label>}
          {formMessage && <p className="notice error" role="alert">{formMessage}</p>}
          <div className="register-modal-actions">
            <button className="button button-secondary" type="button" disabled={saving} onClick={closeDialog}>Cancelar</button>
            <button className="button" type="submit" disabled={saving}>{saving ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar produto"}</button>
          </div>
          <p className="muted">JPG, PNG ou WebP · até 5 MB.</p>
        </form>
      </section>
    </div>}
  </section>;
}
