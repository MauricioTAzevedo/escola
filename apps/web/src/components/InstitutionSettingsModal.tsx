import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Building2, X, Save, Upload, Trash2, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/Button';

export interface InstitutionSettings {
  schoolName: string;
  schoolSubtitle: string;
  logoDataUrl: string;
}

const STORAGE_KEY = 'escola_institution_settings';

export function loadInstitutionSettings(): InstitutionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore malformed stored settings
  }
  return { schoolName: '', schoolSubtitle: '', logoDataUrl: '' };
}

function saveInstitutionSettings(s: InstitutionSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function InstitutionSettingsModal({ isOpen, onClose }: Props) {
  const [settings, setSettings] = useState<InstitutionSettings>(loadInstitutionSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSettings(loadInstitutionSettings());
      setSaved(false);
    }
  }, [isOpen]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSettings((prev) => ({ ...prev, logoDataUrl: ev.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    saveInstitutionSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearLogo = () => setSettings((prev) => ({ ...prev, logoDataUrl: '' }));

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Configurações da Instituição
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Aparece automaticamente no cabeçalho de todas as provas PDF
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Logo */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Logo da Escola
            </label>
            <div className="flex items-center gap-4">
              {settings.logoDataUrl ? (
                <div className="relative">
                  <img
                    src={settings.logoDataUrl}
                    alt="Logo"
                    className="h-16 w-16 object-contain rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-1"
                  />
                  <button
                    onClick={handleClearLogo}
                    className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-0.5 hover:bg-rose-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="h-16 w-16 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center bg-slate-50 dark:bg-slate-800">
                  <Building2 className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                </div>
              )}
              <label className="cursor-pointer flex items-center space-x-2 px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <Upload className="h-4 w-4" />
                <span>{settings.logoDataUrl ? 'Trocar Logo' : 'Carregar Logo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
              </label>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                PNG, JPG ou SVG. Máx. 2MB.
              </p>
            </div>
          </div>

          {/* School name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nome da Escola / Instituição
            </label>
            <input
              type="text"
              value={settings.schoolName}
              onChange={(e) => setSettings((prev) => ({ ...prev, schoolName: e.target.value }))}
              placeholder="Ex: Colégio Estadual João Pessoa"
              className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* School subtitle */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Subtítulo / Endereço (opcional)
            </label>
            <input
              type="text"
              value={settings.schoolSubtitle}
              onChange={(e) => setSettings((prev) => ({ ...prev, schoolSubtitle: e.target.value }))}
              placeholder="Ex: Rua das Flores, 123 — São Paulo, SP"
              className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Preview */}
          {(settings.schoolName || settings.logoDataUrl) && (
            <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/40">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
                Preview do Cabeçalho:
              </p>
              <div className="flex items-center space-x-3">
                {settings.logoDataUrl && (
                  <img src={settings.logoDataUrl} alt="Logo" className="h-10 w-10 object-contain" />
                )}
                <div>
                  {settings.schoolName && (
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {settings.schoolName}
                    </p>
                  )}
                  {settings.schoolSubtitle && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {settings.schoolSubtitle}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end space-x-3">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSave}>
            {saved ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Salvo!
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvar Configurações
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
