import { Injectable } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material';
import { Logger } from 'app/core/electron/logger.helper';
import { BugReportComponent } from 'app/window/bug-report/bug-report.component';
const os = osLib;
const request = requestLib;

@Injectable()
export class BugReportService {

  private logs = "";
  private dialogRef: MatDialogRef<any>;

    constructor(
        private dialog: MatDialog
    ) { }


  public writeLog(from, msg) {
    this.logs += (new Date()).toISOString() + "\n" + from + "\n" + msg + "\n\n";
  }

  public send(description) {
    let osInfo = os.type() + " " + os.release() + " " + os.platform();
    let body = osInfo + "\n" + description + "\n\n" + this.logs;
    request.post({url: 'http://api.no-emu.co/report.php', form: { logs: body }}, (err, httpResponse, body) => {
      if (err) Logger.error(JSON.stringify(err));
      else {
        this.logs = "";
      }
    })
  }

  public open() {
    this.dialogRef = this.dialog.open(BugReportComponent, {
        width: '820px',
        height: '600px'
    });

    this.dialogRef.afterClosed().subscribe(description => {
      if (description) {
        this.send(description);
      }
    });
  }

}
