import { z } from 'zod';

const addressList = z.union([z.string().min(1), z.array(z.string().min(1))]).transform((v) =>
  Array.isArray(v) ? v : [v],
);

export const attachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  content_base64: z.string().min(1),
  content_type: z.string().optional(),
});

export const sendEmailSchema = z
  .object({
    from: z.string().min(1).optional(),
    to: addressList,
    cc: addressList.optional(),
    bcc: addressList.optional(),
    reply_to: addressList.optional(),
    subject: z.string().min(1),
    html: z.string().optional(),
    text: z.string().optional(),
    headers: z.record(z.string()).optional(),
    attachments: z.array(attachmentSchema).max(20).optional(),
    tags: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  })
  .refine((d) => d.html || d.text, { message: 'Either html or text is required' });

export type SendEmailInput = z.infer<typeof sendEmailSchema>;
