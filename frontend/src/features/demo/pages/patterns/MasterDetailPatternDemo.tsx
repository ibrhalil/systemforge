import { useState } from 'react';
import { Page } from '../../../../components/Page';
import { SearchInput } from '../../../../components/ui/SearchInput';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Toggle } from '../../../../components/ui/Toggle';
import { DetailField } from '../../../../components/detail/DetailPanel';
import { DemoSection } from '../../components/DemoSection';
import { MOCK_PRODUCTS, type MockProduct } from '../../mockData';
import { LuPlus, LuPencil, LuTag } from 'react-icons/lu';

function LiveMasterDetail() {
  const [products, setProducts] = useState<MockProduct[]>(MOCK_PRODUCTS);
  const [selectedId, setSelectedId] = useState<string>(MOCK_PRODUCTS[0].id);
  const [search, setSearch] = useState('');

  const selectedProduct = products.find((p) => p.id === selectedId) ?? products[0];

  const filteredProducts = products.filter((p) =>
    [p.name, p.category, p.sku].some((v) => v.toLowerCase().includes(search.toLowerCase())),
  );

  const toggleActive = (id: string) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p)),
    );
  };

  const handleStockUpdate = (id: string, delta: number) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, stock: Math.max(0, p.stock + delta) } : p)),
    );
  };

  return (
    <div className="rounded-lg border border-glass bg-bg/50 p-6 shadow-sm">
      <Page
        breadcrumb={[{ label: 'Catalog' }, { label: 'Inventory Master-Detail' }]}
        title="Product Inventory Master-Detail"
        description="Inspect and adjust inventory details with real-time selection state."
        actions={
          <Button variant="primary" size="sm" onClick={() => alert('Add product dialog')}>
            <LuPlus className="h-4 w-4" />
            <span>Add Item</span>
          </Button>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Master List (5 cols) */}
          <div className="lg:col-span-5 rounded-xl border border-glass bg-surface overflow-hidden flex flex-col shadow-sm">
            <div className="p-3 border-b border-glass bg-bg/30">
              <SearchInput
                className="w-full"
                value={search}
                onChange={setSearch}
                placeholder="Filter products or SKU..."
              />
            </div>

            <div className="max-h-[480px] overflow-y-auto divide-y divide-glass/50">
              {filteredProducts.map((prod) => {
                const isSelected = prod.id === selectedProduct.id;
                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => setSelectedId(prod.id)}
                    className={`w-full text-left p-3.5 transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-accent/10 border-l-4 border-l-accent'
                        : 'hover:bg-main/5'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold truncate ${isSelected ? 'text-accent' : 'text-main'}`}>
                          {prod.name}
                        </span>
                        <Badge tone={prod.active ? 'green' : 'muted'} className="text-[10px] py-0">
                          {prod.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted">
                        <span>{prod.category}</span>
                        <span>•</span>
                        <span className="font-mono">{prod.sku}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold text-main">${prod.price.toFixed(2)}</span>
                      <span className={`block text-[11px] font-medium ${prod.stock === 0 ? 'text-danger' : 'text-muted'}`}>
                        {prod.stock === 0 ? 'Out of stock' : `${prod.stock} in stock`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Detail Inspector (7 cols) */}
          <div className="lg:col-span-7 rounded-xl border border-glass bg-surface p-6 space-y-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-glass pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-main">{selectedProduct.name}</h2>
                  <Badge tone={selectedProduct.active ? 'green' : 'muted'}>
                    {selectedProduct.active ? 'In Catalog' : 'Draft'}
                  </Badge>
                </div>
                <p className="text-xs text-muted flex items-center gap-2">
                  <LuTag className="h-3.5 w-3.5" />
                  <span>Category: {selectedProduct.category}</span>
                  <span>•</span>
                  <span className="font-mono">SKU: {selectedProduct.sku}</span>
                </p>
              </div>

              <Button variant="secondary" size="sm" onClick={() => alert(`Edit ${selectedProduct.name}`)}>
                <LuPencil className="h-3.5 w-3.5" />
                <span>Edit Item</span>
              </Button>
            </div>

            {/* Quick Actions & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-glass bg-main/[0.02] space-y-2">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">Catalog Visibility</span>
                <div>
                  <Toggle
                    label={selectedProduct.active ? 'Published & Active' : 'Hidden from Catalog'}
                    checked={selectedProduct.active}
                    onChange={() => toggleActive(selectedProduct.id)}
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl border border-glass bg-main/[0.02] space-y-2">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">Inventory Quantity</span>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-main">{selectedProduct.stock} units</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleStockUpdate(selectedProduct.id, -10)}
                      className="px-2 py-0.5 rounded border border-glass bg-surface text-xs font-semibold hover:bg-main/5"
                    >
                      -10
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStockUpdate(selectedProduct.id, 10)}
                      className="px-2 py-0.5 rounded border border-glass bg-surface text-xs font-semibold hover:bg-main/5"
                    >
                      +10
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Metadata Definition List */}
            <div className="grid grid-cols-2 gap-4 border-t border-glass pt-4">
              <DetailField label="Unit Retail Price">${selectedProduct.price.toFixed(2)} USD</DetailField>
              <DetailField label="Inventory Value">
                ${(selectedProduct.price * selectedProduct.stock).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </DetailField>
              <DetailField label="Inventory Item ID">
                <span className="font-mono text-xs text-muted">{selectedProduct.id}</span>
              </DetailField>
              <DetailField label="Last Price Sync">{selectedProduct.updatedAt}</DetailField>
            </div>
          </div>
        </div>
      </Page>
    </div>
  );
}

const MASTER_DETAIL_CODE = `import { Page } from 'components/Page';
import { SearchInput } from 'components/ui/SearchInput';
import { Badge } from 'components/ui/Badge';
import { Toggle } from 'components/ui/Toggle';

export function MasterDetailPage() {
  const [selectedId, setSelectedId] = useState(items[0].id);
  const selectedItem = items.find(i => i.id === selectedId);

  return (
    <Page title="Master-Detail" description="Split view container">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Master List Pane (5 cols) */}
        <div className="lg:col-span-5 card">
          <SearchInput value={query} onChange={setQuery} />
          <div className="divide-y overflow-y-auto">
            {filteredItems.map(item => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={selectedId === item.id ? 'bg-accent/10 border-l-4 border-accent' : ''}
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>

        {/* Detail Inspector Pane (7 cols) */}
        <div className="lg:col-span-7 card p-6">
          <h2>{selectedItem.title}</h2>
          <Toggle label="Active" checked={selectedItem.active} onChange={toggle} />
          {/* Properties & Fields */}
        </div>
      </div>
    </Page>
  );
}`;

export function MasterDetailPatternDemo() {
  return (
    <div className="space-y-10">
      <div>
        <div className="inline-flex items-center gap-1.5 rounded-md bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent mb-2">
          Page Pattern
        </div>
        <h1 className="text-2xl font-bold text-main">Master-Detail / Split View Pattern</h1>
        <p className="mt-1 text-sm text-muted">
          Two-column split view used for fast inspection and item browsing without navigating away from the list.
          Ideal for CRM leads, inventory items, knowledge base notes, and custom records.
        </p>
      </div>

      <DemoSection
        title="Live Interactive Split View"
        description="Click items on the left list to inspect details on the right panel. Try changing stock quantities or active catalog status."
        code={MASTER_DETAIL_CODE}
      >
        <LiveMasterDetail />
      </DemoSection>
    </div>
  );
}
