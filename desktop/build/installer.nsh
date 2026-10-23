; Extra NSIS steps for the kessoku moe installer (electron-builder `nsis.include`).

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to kessoku moe"
  !define MUI_WELCOMEPAGE_TEXT "All your anime, one stage.$\r$\n$\r$\nThis sets up kessoku moe for desktop: its own window, a Start menu entry, and quiet updates in the background.$\r$\n$\r$\nClose any open kessoku moe windows, then click Next."
  !insertmacro MUI_PAGE_WELCOME
!macroend

; Register kessoku-moe:// links at install time so they work before first launch.
!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\kessoku-moe" "" "URL:kessoku moe"
  WriteRegStr SHELL_CONTEXT "Software\Classes\kessoku-moe" "URL Protocol" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\kessoku-moe\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\kessoku-moe\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey SHELL_CONTEXT "Software\Classes\kessoku-moe"
!macroend
