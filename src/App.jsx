import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Chat from './pages/Chat';
import Meet from './pages/Meet';
import Video from './pages/Video'; 

function App() {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/meet" element={<Meet />} />
        <Route path="/video/:meetingId" element={<Video />} />
        <Route path="/video" element={<Video />} />
      </Routes>
    </Router>
  );
}

export default App;
