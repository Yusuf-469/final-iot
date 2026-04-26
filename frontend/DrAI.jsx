import React, { useState, useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Html, Text } from '@react-three/drei';
import { createRoot } from 'react-dom/client';

// Preload the GLB model
useGLTF.preload('/models/medical-doctor-3d-model.glb');

// 3D Model Component
function DrAIModel({ onClick }) {
  const { scene } = useGLTF('/models/medical-doctor-3d-model.glb');
  const modelRef = useRef();
  const [hovered, setHovered] = useState(false);

  // Auto-rotate
  useFrame((state, delta) => {
    if (modelRef.current) {
      modelRef.current.rotation.y += delta * 0.2;
    }
  });

  // Fit camera to model
  const { camera } = useThree();
  useEffect(() => {
    if (scene) {
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const distance = maxDim / (2 * Math.tan(Math.PI * camera.fov / 360));
      camera.position.set(center.x, center.y, center.z + distance * 1.5);
      camera.lookAt(center);
    }
  }, [scene, camera]);

  return (
    <group
      ref={modelRef}
      onClick={onClick}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <primitive object={scene} />
      {hovered && (
        <Html position={[0, 2, 0]}>
          <div style={{
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '14px',
            pointerEvents: 'none'
          }}>
            Click to talk to Dr AI
          </div>
        </Html>
      )}
    </group>
  );
}

// Loading Fallback
function LoadingFallback() {
  return (
    <Html center>
      <div style={{ color: 'white', fontSize: '18px' }}>
        <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>
        Loading 3D Model...
      </div>
    </Html>
  );
}

// Error Fallback
function ErrorFallback() {
  return (
    <Html center>
      <div style={{ color: 'white', textAlign: 'center' }}>
        <i className="fas fa-user-md" style={{ fontSize: '48px', marginBottom: '16px' }}></i>
        <div>Dr. AI Model</div>
        <div style={{ fontSize: '14px', opacity: 0.7 }}>3D model failed to load</div>
      </div>
    </Html>
  );
}

// Chat Panel Component
function ChatPanel({ isOpen, onClose, messages, onSendMessage, isTyping }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSend = () => {
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '45%',
      background: 'rgba(0,0,0,0.95)',
      borderTop: '1px solid rgba(255,255,255,0.2)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 1000
    }}>
      <div style={{
        padding: '16px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ margin: 0, color: 'white' }}>Dr AI</h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            fontSize: '20px',
            cursor: 'pointer'
          }}
        >
          ×
        </button>
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px'
      }}>
        {messages.map((msg, index) => (
          <div key={index} style={{
            display: 'flex',
            marginBottom: '12px',
            justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start'
          }}>
            {msg.sender === 'ai' && (
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: '#007bff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '8px',
                flexShrink: 0
              }}>
                <i className="fas fa-robot" style={{ color: 'white', fontSize: '14px' }}></i>
              </div>
            )}
            <div style={{
              maxWidth: '70%',
              padding: '8px 12px',
              borderRadius: '12px',
              background: msg.sender === 'user' ? '#007bff' : 'rgba(255,255,255,0.1)',
              color: 'white'
            }}>
              {msg.text}
            </div>
          </div>
        ))}
        {isTyping && (
          <div style={{ display: 'flex', marginBottom: '12px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#007bff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '8px',
              flexShrink: 0
            }}>
              <i className="fas fa-robot" style={{ color: 'white', fontSize: '14px' }}></i>
            </div>
            <div style={{
              padding: '8px 12px',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.1)',
              color: 'white',
              display: 'flex',
              alignItems: 'center'
            }}>
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{
        padding: '16px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        gap: '8px'
      }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask Dr. AI about your health..."
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '20px',
            background: 'rgba(255,255,255,0.1)',
            color: 'white',
            outline: 'none'
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: '20px',
            background: input.trim() ? '#007bff' : 'rgba(255,255,255,0.2)',
            color: 'white',
            cursor: input.trim() ? 'pointer' : 'not-allowed'
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

// Main DrAI Component
function DrAI() {
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([
    { sender: 'ai', text: 'Hello! I\'m Dr. AI, your health monitoring assistant. How can I help you today?' }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  const handleModelClick = () => {
    setChatOpen(true);
  };

  const handleSendMessage = async (message) => {
    setMessages(prev => [...prev, { sender: 'user', text: message }]);
    setIsTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      const data = await response.json();
      setMessages(prev => [...prev, { sender: 'ai', text: data.response || 'I\'m sorry, I couldn\'t process your message.' }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { sender: 'ai', text: 'Sorry, I\'m having trouble connecting. Please try again.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a' }}>
      <div style={{ width: '100%', height: chatOpen ? '55%' : '100%' }}>
        <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
          <Suspense fallback={<LoadingFallback />}>
            <DrAIModel onClick={handleModelClick} />
            <OrbitControls enablePan={false} enableZoom={true} enableRotate={true} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} />
          </Suspense>
        </Canvas>
      </div>

      <ChatPanel
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={messages}
        onSendMessage={handleSendMessage}
        isTyping={isTyping}
      />

      <style jsx>{`
        .typing-indicator {
          display: flex;
          gap: 4px;
        }
        .typing-indicator span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: white;
          animation: typing 1.4s infinite ease-in-out;
        }
        .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
        .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
        @keyframes typing {
          0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Export for potential use
export default DrAI;

// Auto-render if this script is loaded
if (typeof window !== 'undefined') {
  const container = document.getElementById('dr-ai-root');
  if (container) {
    const root = createRoot(container);
    root.render(<DrAI />);
  }
}