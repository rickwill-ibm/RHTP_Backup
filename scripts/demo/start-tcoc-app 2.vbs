' TCOC Application Silent Launcher
' This VBScript launches the application without showing a console window
' Perfect for desktop shortcuts with a clean user experience

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the directory where this script is located
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Change to the project directory and run the batch file hidden
WshShell.CurrentDirectory = scriptDir
WshShell.Run """" & scriptDir & "\start-tcoc-app.bat""", 0, False

' Clean up
Set WshShell = Nothing
Set fso = Nothing

' Made with Bob
