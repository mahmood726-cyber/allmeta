"""Fix missing showNotification function and other issues"""

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

fixes = 0

# Fix 1: Add showNotification function if missing
if 'function showNotification' not in content and 'const showNotification' not in content:
    # Find a good place to insert - after the IIFE opening
    notification_func = '''
  // =========================================================================
  // NOTIFICATION SYSTEM
  // =========================================================================
  function showNotification(message, type = 'info') {
    // Create notification element if it doesn't exist
    let container = document.getElementById('notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-container';
      container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;max-width:400px;';
      document.body.appendChild(container);
    }

    const notification = document.createElement('div');
    const colors = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6'
    };
    const bgColor = colors[type] || colors.info;

    notification.style.cssText = `
      background: ${bgColor};
      color: white;
      padding: 12px 20px;
      margin-bottom: 10px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-size: 14px;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
    `;
    notification.textContent = message;
    container.appendChild(notification);

    // Animate in
    requestAnimationFrame(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateX(0)';
    });

    // Auto dismiss after 4 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }

'''
    # Insert after "(function() {" or after first comment block
    insert_patterns = [
        '(function() {\n',
        '(function () {\n',
        "'use strict';\n"
    ]

    for pattern in insert_patterns:
        if pattern in content:
            pos = content.find(pattern) + len(pattern)
            content = content[:pos] + notification_func + content[pos:]
            fixes += 1
            print('FIX 1: Added showNotification function')
            break
    else:
        # Fallback: insert at beginning
        content = notification_func + content
        fixes += 1
        print('FIX 1: Added showNotification function (at start)')

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\nApplied {fixes} fixes')
print(f'app.js size: {len(content):,} chars')
