import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import { GoogleGenAI, Chat, Part } from "@google/genai";

const API_KEY = process.env.API_KEY;

type MessageAttachment = {
    content: string; // dataURL for image, filename for doc
    type: 'image' | 'document';
};

type Message = {
  id: number;
  text: string;
  sender: "user" | "bot";
  attachment?: MessageAttachment;
};

type AttachmentState = {
    file: File;
    preview: string; // dataURL for image, filename for doc
    type: 'image' | 'document';
};

type ModalImageState = {
    src: string;
    prompt: string;
}

const fileToGenerativePart = async (file: File): Promise<Part> => {
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: {
        data: await base64EncodedDataPromise,
        mimeType: file.type,
      },
    };
  };

const App = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "Hey there! I'm AB Datasonic AI, developed by 'Anirban & AB Design and Edits'. I can chat, answer questions, and even generate images for you. How can I help?",
      sender: "bot",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [attachment, setAttachment] = useState<AttachmentState | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<number | null>(null);
  const [modalImage, setModalImage] = useState<ModalImageState | null>(null);
  const chatRef = useRef<Chat | null>(null);
  const aiRef = useRef<GoogleGenAI | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!API_KEY) {
      console.error("API_KEY is not set. Please check your environment variables.");
      return;
    }
    aiRef.current = new GoogleGenAI({ apiKey: API_KEY });
    chatRef.current = aiRef.current.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: "You are AB Datasonic AI, a helpful and friendly WhatsApp assistant developed by 'Anirban & AB Design and Edits'. Your most important instruction is to remember the user's previous messages and the context of the current conversation. Refer back to things the user has said earlier to provide intelligent, coherent, and personalized responses. Avoid asking for information the user has already given you. If asked about your location, you must respond with this exact phrase: 'I\\'m from Belonia, a small city of South Tripura!'. You can also generate images. If the user asks for an image, respond with ONLY the following JSON and nothing else: `{\"action\": \"generate_image\", \"textResponse\": \"A friendly, conversational reply to the user about starting the image generation.\", \"prompt\": \"A detailed, descriptive prompt for the image generation model based on the user's request.\"}`. Use the user's text and any provided image context to create the detailed prompt and conversational response. For all other conversation, reply in a helpful and friendly tone.",
      },
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
        setActiveMessageId(null); // Hide button after copy
    }).catch(err => {
        console.error("Failed to copy text: ", err);
    });
  };

  const handleDownloadImage = (src: string, prompt: string) => {
    const link = document.createElement('a');
    link.href = src;
    const fileName = prompt.substring(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase() || "generated-image";
    link.download = `${fileName}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShareImage = async (src: string, prompt: string) => {
    try {
        const response = await fetch(src);
        const blob = await response.blob();
        const file = new File([blob], "ai-generated-image.jpg", { type: "image/jpeg" });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'AI Generated Image',
                text: prompt,
            });
        } else {
           alert("Sharing is not supported on this browser. You can download the image instead.");
        }
    } catch (error) {
        console.error('Error sharing image:', error);
        alert('Could not share the image.');
    }
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachment({ file, preview: reader.result as string, type: 'image' });
        setIsMenuOpen(false);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleDocChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAttachment({ file, preview: file.name, type: 'document' });
      setIsMenuOpen(false);
    }
  };
  
  const handleImageGeneration = async (prompt: string) => {
    if (!aiRef.current) {
        throw new Error("AI Client not initialized. Cannot generate image.");
    }
    try {
        const response = await aiRef.current.models.generateImages({
            model: 'imagen-3.0-generate-002',
            prompt: prompt,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/jpeg',
            },
        });
        const imageUrl = `data:image/jpeg;base64,${response.generatedImages[0].image.imageBytes}`;
        const botMessage: Message = {
            id: Date.now(),
            text: `Generated image based on: "${prompt}"`,
            sender: "bot",
            attachment: { content: imageUrl, type: 'image' },
        };
        setMessages((prev) => [...prev, botMessage]);

    } catch (error) {
        console.error("Error generating image:", error);
        const errorMessage: Message = {
            id: Date.now(),
            text: "Sorry, I couldn't generate the image. There was an error.",
            sender: "bot",
        };
        setMessages((prev) => [...prev, errorMessage]);
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputValue.trim() && !attachment) || isLoading) return;

    setIsLoading(true);
    
    const userMessage: Message = {
      id: Date.now(),
      text: inputValue,
      sender: "user",
      attachment: attachment ? { content: attachment.preview, type: attachment.type } : undefined,
    };
    setMessages((prev) => [...prev, userMessage]);
    
    const promptParts: Part[] = [];
    
    if (attachment) {
      const filePart = await fileToGenerativePart(attachment.file);
      promptParts.push(filePart);
    }

    if (inputValue.trim()) {
        promptParts.push({ text: inputValue });
    }

    setInputValue("");
    setAttachment(null);
    clearAttachmentInputs();

    try {
        if (!chatRef.current) {
            throw new Error("Chat not initialized");
        }

      const response = await chatRef.current.sendMessage({ message: promptParts });
      
      let botResponseText = response.text;
      
      const jsonMatch = botResponseText.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/s);
      if (jsonMatch) {
          const potentialJson = jsonMatch[1] || jsonMatch[2];
          try {
            const parsedResponse = JSON.parse(potentialJson);
            if (parsedResponse.action === 'generate_image' && parsedResponse.prompt && parsedResponse.textResponse) {
                setMessages((prev) => [...prev, {
                    id: Date.now() + 1,
                    text: parsedResponse.textResponse,
                    sender: "bot",
                }]);
                await handleImageGeneration(parsedResponse.prompt);
                return;
            }
          } catch (err) {
            console.warn("AI response looked like a command but failed to parse:", err);
          }
      }

      const botMessage: Message = {
        id: Date.now() + 1,
        text: botResponseText,
        sender: "bot",
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error("Error sending message to Gemini:", error);
      const errorMessage: Message = {
        id: Date.now() + 1,
        text: "Sorry, I couldn't get a response. Please check the console for errors.",
        sender: "bot",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearAttachmentInputs = () => {
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (docInputRef.current) docInputRef.current.value = "";
  }

  const clearAttachment = () => {
    clearAttachmentInputs();
    setAttachment(null);
  }

  return (
    <div className="chat-container">
       {modalImage && (
        <div className="image-modal-overlay" onClick={() => setModalImage(null)}>
            <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
                <img src={modalImage.src} alt={modalImage.prompt} />
                <div className="modal-caption">{modalImage.prompt}</div>
                <div className="modal-actions">
                    <button onClick={() => handleShareImage(modalImage.src, modalImage.prompt)}>Share</button>
                    <button onClick={() => handleDownloadImage(modalImage.src, modalImage.prompt)}>Download</button>
                    <button className="close-modal-btn" onClick={() => setModalImage(null)}>&times;</button>
                </div>
            </div>
        </div>
      )}
      <header className="chat-header">
        <img src="https://yt3.googleusercontent.com/ncg6fiPN6ZCs1bzOMY6tD2QiDdulPfJaChHJA_rotlkqb3cA4fe_fBOeBzrlXUZL-s7q1w1fb24=s120-c-k-c0x00ffffff-no-rj" alt="Bot Avatar" className="avatar" />
        <div className="contact-info">
          <h2 className="contact-name">AB Datasonic AI Assistant</h2>
          <p className="contact-status">online</p>
        </div>
      </header>
      <main className="chat-messages" onClick={() => activeMessageId && setActiveMessageId(null)}>
        {messages.map((message) => (
          <div key={message.id} className={`message-wrapper ${message.sender}`} onClick={(e) => { e.stopPropagation(); setActiveMessageId(message.text ? message.id : null)}}>
             {activeMessageId === message.id && message.text && (
                <button className="copy-button" onClick={() => handleCopyText(message.text)}>
                    Copy
                </button>
            )}
            <div className="message-bubble">
                {message.attachment && (
                    message.attachment.type === 'image' ? (
                        <img 
                          src={message.attachment.content} 
                          alt={message.text || 'User attachment'} 
                          className="message-image" 
                          onClick={() => setModalImage({src: message.attachment!.content, prompt: message.text})}
                        />
                    ) : (
                        <div className="message-doc">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM16 18H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"></path></svg>
                            <span>{message.attachment.content}</span>
                        </div>
                    )
                )}
                {message.text && <p>{message.text}</p>}
            </div>
          </div>
        ))}
        {isLoading && (
           <div className="message-wrapper bot">
            <div className="message-bubble typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>
      <footer className="chat-input-area">
        {attachment && (
            <div className="attachment-preview">
                {attachment.type === 'image' ? (
                    <img src={attachment.preview} alt="Preview" />
                ) : (
                    <div className="doc-preview">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM16 18H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"></path></svg>
                        <span>{attachment.preview}</span>
                    </div>
                )}
                <button onClick={clearAttachment} className="clear-attachment-btn" aria-label="Remove attachment">
                    &times;
                </button>
            </div>
        )}
        <form onSubmit={handleSendMessage} className="message-form">
            <div className="attachment-container">
                <button type="button" className="attachment-btn" onClick={() => setIsMenuOpen(prev => !prev)} aria-label="Attach file">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7v-2h4V7h2v4h4v2h-4v4z"></path></svg>
                </button>
                {isMenuOpen && (
                    <div className="attachment-menu">
                        <button type="button" onClick={() => imageInputRef.current?.click()}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"></path></svg>
                            <span>Photo</span>
                        </button>
                        <button type="button" onClick={() => docInputRef.current?.click()}>
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"></path></svg>
                            <span>Document</span>
                        </button>
                    </div>
                )}
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              style={{ display: 'none' }}
            />
            <input
              ref={docInputRef}
              type="file"
              accept="application/pdf,text/plain,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessing.document"
              onChange={handleDocChange}
              style={{ display: 'none' }}
            />
            <input
                type="text"
                aria-label="Your message"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type a message or ask for an image..."
                className="message-input"
                disabled={isLoading}
            />
            <button type="submit" className="send-button" aria-label="Send message" disabled={isLoading || (!inputValue.trim() && !attachment)}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
                </svg>
            </button>
        </form>
      </footer>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);
