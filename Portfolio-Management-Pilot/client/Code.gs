function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('My Product')
    .addItem('Authorize License', 'authCheck')
    .addToUi();
}

function authCheck() {
  // This function exists just to trigger the Google Permission Popup
  var email = Session.getEffectiveUser().getEmail();
  Browser.msgBox("License authorized for: " + email);
}



