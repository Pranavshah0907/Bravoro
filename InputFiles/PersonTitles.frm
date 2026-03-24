VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} PersonTitles 
   Caption         =   "Person Titles"
   ClientHeight    =   6600
   ClientLeft      =   120
   ClientTop       =   470
   ClientWidth     =   10100
   OleObjectBlob   =   "PersonTitles.frx":0000
   StartUpPosition =   1  'CenterOwner
End
Attribute VB_Name = "PersonTitles"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Private Sub CommandButton1_Click()

    Dim ctrl As Control
    Dim result As String
    
    ' Loop through all controls INSIDE Frame1
    ' (Make sure your Frame is named "Frame1" in properties)
    For Each ctrl In Me.Frame1.Controls
        
        ' Check if the control is a CheckBox
        If TypeName(ctrl) = "CheckBox" Then
            
            ' If it is ticked (True)
            If ctrl.Value = True Then
                ' Add its text (Caption) to the result string
                result = result & ctrl.Caption & ", "
            End If
        End If
    Next ctrl
    
    ' Remove the extra comma and space at the end
    If Len(result) > 0 Then
        result = Left(result, Len(result) - 2)
    End If
    
    ' Put the final string into the cell that was clicked
    ActiveCell.Value = result
    
    ' Close the pop-up form
    Unload Me

End Sub
