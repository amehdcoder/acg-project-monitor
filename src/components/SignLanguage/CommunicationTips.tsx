import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const CommunicationTips = () => {
  return (
    <div className="space-y-4">
      {/* Quick Etiquette */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            🤝 Communication Etiquette
            <Badge variant="outline" className="text-[10px]">Essential Reading</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: "👁️", title: "Maintain Eye Contact", desc: "Always face the person directly. Eye contact is essential in Deaf culture — it shows respect and attention." },
              { icon: "💡", title: "Good Lighting", desc: "Ensure your face and hands are well-lit. Never stand with a bright light behind you (backlit)." },
              { icon: "🚫", title: "Don't Cover Your Mouth", desc: "Many people lip-read. Keep your face visible — no masks, hands, or objects blocking your mouth." },
              { icon: "🐢", title: "Be Patient", desc: "Allow extra time. Never rush. Repeat or rephrase if needed. Use visuals and gestures freely." },
              { icon: "📱", title: "Use Your Phone Screen", desc: "Type questions on your phone and show the screen. This is universally effective for complex questions." },
              { icon: "📝", title: "Carry Paper & Pen", desc: "Written communication is a reliable fallback. Draw pictures for concepts that are hard to sign." },
              { icon: "🧏", title: "Get Attention Properly", desc: "Tap lightly on the shoulder or wave in their peripheral vision. Never shout or grab." },
              { icon: "🔇", title: "Reduce Background Noise", desc: "Even for people with partial hearing, background noise makes communication much harder." },
            ].map((tip, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                <span className="text-2xl shrink-0">{tip.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{tip.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{tip.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Levels of Hearing Impairment */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">🔊 Understanding Hearing Impairment Levels</CardTitle>
          <p className="text-xs text-muted-foreground">Adapt your communication approach based on the person's level of hearing ability</p>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {[
              {
                level: "Mild Hearing Loss",
                range: "26–40 dB",
                color: "bg-green-500",
                approach: "Speak clearly at normal volume facing the person. Minimize background noise. They may hear most speech but miss soft sounds. Use visual aids to supplement.",
              },
              {
                level: "Moderate Hearing Loss",
                range: "41–55 dB",
                color: "bg-yellow-500",
                approach: "Speak slightly louder, clearly, and slowly. Use gestures alongside speech. Show written questions on phone/paper. The visual response board is very helpful here.",
              },
              {
                level: "Moderately Severe",
                range: "56–70 dB",
                color: "bg-orange-500",
                approach: "Rely primarily on visual communication — sign language, written text, and the visual response board. Speech alone will not be sufficient. Ensure good lighting.",
              },
              {
                level: "Severe Hearing Loss",
                range: "71–90 dB",
                color: "bg-red-500",
                approach: "Use sign language, written communication, and the visual response board exclusively. If a sign language interpreter is available, use them. Phone-screen typing works well.",
              },
              {
                level: "Profound Hearing Loss / Deaf",
                range: "91+ dB",
                color: "bg-red-700",
                approach: "Full visual communication only. Use sign language if you know it, otherwise rely on written text (phone screen or paper), the visual response board, and gestures. Be extra patient and expressive with facial expressions.",
              },
            ].map((item, i) => (
              <AccordionItem key={i} value={`level-${i}`}>
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${item.color}`} />
                    <span className="text-sm font-medium">{item.level}</span>
                    <Badge variant="outline" className="text-[10px]">{item.range}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground pb-3">
                  {item.approach}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Common mistakes */}
      <Card className="border-destructive/20 bg-destructive/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            ⚠️ Common Mistakes to Avoid
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-xs space-y-2">
            {[
              "Don't assume all hearing-impaired people know sign language — many rely on lip reading or written text",
              "Don't speak to a companion or interpreter instead of the person — always address them directly",
              "Don't exaggerate lip movements — it distorts the words and makes lip reading harder",
              "Don't use complex medical jargon — keep language simple and clear",
              "Don't touch hearing aids or cochlear implants without permission",
              "Don't give up after one attempt — try different communication methods",
              "Don't assume cognitive impairment — hearing loss does not affect intelligence",
            ].map((mistake, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-destructive mt-0.5">✗</span>
                <span className="text-foreground">{mistake}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Field workflow */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📋 Recommended Field Workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="text-xs space-y-3">
            {[
              { step: "Identify", desc: "Assess the person's preferred communication method. Ask (via gestures/writing) if they use sign language, lip reading, or written text." },
              { step: "Introduce", desc: "Use the Greetings section to introduce yourself. Show your ID card. Use the consent phrases to explain the survey purpose." },
              { step: "Get Consent", desc: "Use the Consent category to clearly explain their rights. Use the visual board for them to indicate Yes/No agreement." },
              { step: "Collect Data", desc: "For each question, use the Sign Guide to learn the sign, then show the Visual Response Board for the answer. Type complex questions on your phone screen." },
              { step: "Verify", desc: "After recording an answer, show it back to the person for confirmation using the Yes/No symbols on the response board." },
              { step: "Thank & Close", desc: "Use the closing phrases to thank them. Provide any follow-up information in writing." },
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.step}</p>
                  <p className="text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};

export default CommunicationTips;
