import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const apiClient = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor to add auth token
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('resume_builder_access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const resumeApi = {
    extractText: async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await apiClient.post('/resume/extract', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },
    optimize: async (resumeText, jobDescriptionText) => {
        const formData = new FormData();
        formData.append('resume_text', resumeText);
        if (jobDescriptionText) {
            formData.append('job_description', jobDescriptionText);
        }
        const response = await apiClient.post('/resume/optimize', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    }
};

export const authApi = {
    login: async (email, password) => {
        const formData = new URLSearchParams();
        formData.append('username', email); // OAuth2 expects 'username'
        formData.append('password', password);
        const response = await apiClient.post('/auth/login', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        if (response.data.access_token) {
            localStorage.setItem('resume_builder_access_token', response.data.access_token);
        }
        return response.data;
    },
    register: async (email, password, fullName) => {
        const response = await apiClient.post('/auth/register', {
            email,
            password,
            full_name: fullName
        });
        return response.data;
    },
    logout: () => {
        localStorage.removeItem('resume_builder_access_token');
    }
};
