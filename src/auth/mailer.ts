export interface Mailer {
  sendOtpEmail(input: {
    to: string;
    code: string;
    expiresInMinutes: number;
  }): Promise<void>;
}

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const REGION = process.env.AWS_REGION;
if (!REGION) throw new Error("AWS_REGION env var is not set");

const ses = new SESv2Client({ region: REGION });

export const mailer = {
  async sendOtpEmail({
    to,
    code,
    expiresInMinutes,
  }: {
    to: string;
    code: string;
    expiresInMinutes: number;
  }): Promise<void> {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: process.env.SES_FROM_EMAIL!,
        Destination: {
          ToAddresses: [to],
        },
        Content: {
          Simple: {
            Subject: {
              Data: "Your login code",
            },
            Body: {
              Text: {
                Data: `Your login code is ${code}. It expires in ${expiresInMinutes} minutes.`,
              },
            },
          },
        },
      })
    );
  },
};