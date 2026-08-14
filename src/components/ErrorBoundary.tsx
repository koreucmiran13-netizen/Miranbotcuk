import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleClearAndReset = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6 font-sans">
          <div className="w-full max-w-2xl bg-slate-900 border border-red-500/30 rounded-3xl p-8 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />
            
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                Sistem Hatası Yakalandı
              </span>
              <h1 className="text-2xl font-bold text-white tracking-tight mt-2">Arayüz Yüklenirken Bir Sorun Oluştu</h1>
              <p className="text-slate-400 text-sm">
                Tarayıcı tarafında bir JavaScript hatası oluştu. Bu durum genellikle eski çerezler veya uyumsuz verilerden kaynaklanır.
              </p>
            </div>

            <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800 space-y-3 font-mono text-xs text-red-300 overflow-auto max-h-60">
              <p className="font-bold text-white text-sm">Hata Detayı:</p>
              <p className="text-red-400 whitespace-pre-wrap">{this.state.error?.toString()}</p>
              {this.state.errorInfo && (
                <p className="text-slate-500 text-[10px] whitespace-pre-wrap leading-relaxed mt-2 border-t border-slate-800 pt-2">
                  {this.state.errorInfo.componentStack}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={this.handleClearAndReset}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-5 rounded-xl transition-all shadow-lg hover:shadow-blue-500/10 cursor-pointer text-center text-xs"
              >
                Çerezleri Temizle ve Sayfayı Yenile
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-3 px-5 rounded-xl transition-all cursor-pointer text-center text-xs"
              >
                Sadece Yeniden Dene
              </button>
            </div>

            <p className="text-[10px] text-slate-500 text-center">
              Önbellek temizleme butonu tarayıcıdaki tüm eski oturum kalıntılarını sıfırlayarak temiz bir başlangıç yapmanızı sağlar.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
