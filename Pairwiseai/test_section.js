(function() {
      toast.className = 'toast-notification toast-' + type;
      toast.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:12px 20px;border-radius:8px;color:white;font-weight:500;z-index:10000;max-width:400px;box-shadow:0 4px 12px rgba(0,0,0,0.3);animation:toastIn 0.3s ease;';

      var colors = { info: '#3b82f6', success: '#22c55e', warning: '#f59e0b', error: '#ef4444' };
      toast.style.backgroundColor = colors[type] || colors.info;
      toast.textContent = message;

      if (!document.getElementById('toast-styles')) {
        var style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = '@keyframes toastIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}';
        document.head.appendChild(style);
      }

      document.body.appendChild(toast);
      setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(function() { toast.remove(); }, 300);
      }, 4000);
    }

document.addEventListener('DOMContentLoaded', function() {
    window.showToast = showToast;  // Make globally accessible

      initializeTabs();
      initializeStudyTable();
      bindEventListeners();
      initializeTheme();
      
      // Theme toggle button
      document.getElementById('themeToggle').addEventListener('click', toggleTheme);
      
      // Bind demo loader button
      document.getElementById('loadDemoBtn').addEventListener('click', () => {
        const demoKeys = Object.keys(DEMO_DATASETS);
        const choice = prompt(`Available demos:\n${demoKeys.map((k, i) => `${i + 1}. ${DEMO_DATASETS[k].name}`).join('\n')}\n\nEnter number:`);
        
        const index = parseInt(choice) - 1;
        if (index >= 0 && index < demoKeys.length) {
          loadDemoDataset(demoKeys[index]);
        }
      });
      
      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        // Ctrl+Enter or Cmd+Enter: Run analysis
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          document.getElementById('runAnalysisBtn').click();
        }
        // Ctrl+/ or Cmd+/: Add study row
        if ((e.ctrlKey || e.metaKey) && e.key === '/') {
          e.preventDefault();
          document.getElementById('addStudyBtn').click();
          // Focus first input of new row
          setTimeout(() => {
            const rows = document.querySelectorAll('#studyTableBody tr');
            const lastRow = rows[rows.length - 1];
            if (lastRow) {
              const firstInput = lastRow.querySelector('input');
              if (firstInput) firstInput.focus();
            }
          }, 50);
        }
        // Ctrl+D or Cmd+D: Load demo
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
          e.preventDefault();
          document.getElementById('loadDemoBtn').click();
        }
        // ? : Show keyboard shortcuts help
        if (e.key === '?' && !e.ctrlKey && !e.metaKey && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
          e.preventDefault();
          showKeyboardShortcutsHelp();
        }
        // Escape: Close modals/panels
        if (e.key === 'Escape') {
          document.getElementById('forestSettingsPanel')?.classList.add('hidden');
          document.getElementById('funnelSettingsPanel')?.classList.add('hidden');
          closeKeyboardShortcutsHelp();
        }
      });
      
      // CSV Import handler
      document.getElementById('importCsvBtn').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.tsv,.txt';
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;
          
          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const text = event.target.result;
              const rows = text.split('\n').filter(r => r.trim());
              if (rows.length < 2) {
                alert('CSV must have header row and at least one data row');
                return;
              }
              
              // Auto-detect delimiter
              const delimiter = text.includes('\t') ? '\t' : ',';
              
              // Clear existing data
              document.getElementById('studyTableBody').innerHTML = '';
              
              // Parse header to find column indices
              const header = rows[0].split(delimiter).map(c => c.trim().toLowerCase().replace(/"/g, ''));
              const nameIdx = header.findIndex(h => h.includes('study') || h.includes('name') || h.includes('author'));
              const evtTIdx = header.findIndex(h => h.includes('event') && h.includes('t') || h === 'events_t' || h === 'ai');
              const nTIdx = header.findIndex(h => (h.includes('n') && h.includes('t')) || h === 'n_t' || h === 'n1');
              const evtCIdx = header.findIndex(h => h.includes('event') && h.includes('c') || h === 'events_c' || h === 'bi');
              const nCIdx = header.findIndex(h => (h.includes('n') && h.includes('c')) || h === 'n_c' || h === 'n2');
              
              // Skip header row, parse data
              let imported = 0;
              rows.slice(1).forEach(row => {
                const cols = row.split(delimiter).map(c => c.trim().replace(/"/g, ''));
                if (cols.length >= 5) {
                  // Try to use detected column indices, fallback to positional
                  const name = nameIdx >= 0 ? cols[nameIdx] : cols[0];
                  const events_t = parseInt(evtTIdx >= 0 ? cols[evtTIdx] : cols[1]) || 0;
                  const n_t = parseInt(nTIdx >= 0 ? cols[nTIdx] : cols[2]) || 0;
                  const events_c = parseInt(evtCIdx >= 0 ? cols[evtCIdx] : cols[3]) || 0;
                  const n_c = parseInt(nCIdx >= 0 ? cols[nCIdx] : cols[4]) || 0;
                  
                  if (n_t > 0 || n_c > 0) {
                    addStudyRow({ name, events_t, n_t, events_c, n_c });
                    imported++;
                  }
                }
              });
              
              updateDataSummary();
              alert(`Imported ${imported} studies from ${file.name}`);
              
            } catch (err) {
              log.error('CSV import failed:', err);
              alert('Failed to parse CSV: ' + err.message);
            }
          };
          reader.readAsText(file);
        };
        input.click();
      });
      
      // CSV Export handler
      document.getElementById('exportCsvBtn').addEventListener('click', () => {
        const studies = getStudyData().filter(s => s.valid);
        if (studies.length === 0) {
          alert('No valid studies to export.');
          return;
        }
        
        // Create CSV content
        const header = 'Study,Events_T,N_T,Events_C,N_C';
        const rows = studies.map(s => 
          `"${s.name.replace(/"/g, '""')}",${s.events_t},${s.n_t},${s.events_c},${s.n_c}`
        );
        const csv = [header, ...rows].join('\n');

        // Download CSV
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'meta_analysis_data.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    // =============================================
    // SECTION: MCMC CONVERGENCE DIAGNOSTICS
    // Reference: Gelman & Rubin (1992), Vehtari et al. (2021)

})();